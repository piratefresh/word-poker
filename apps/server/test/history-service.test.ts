/**
 * history-service.test.ts — STO-455: the durable write itself, against a throwaway database.
 *
 * What this suite pins: one call writes the session, hand, seats and ordered actions whole;
 * a retry of the same payload is a no-op; a different payload for the same hand is a conflict,
 * never an overwrite; and a write that fails partway leaves nothing behind — the transaction
 * is the crash boundary between settlement and persistence.
 *
 * The database is the run-target pattern from `packages/db`'s suites: a throwaway database (or,
 * on a host that refuses `create database`, a run-scoped schema) built for this run and dropped
 * in `after`. Skipped entirely when no server is configured.
 */
import assert from "assert";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SettlementJournal } from "../src/history/settlement-journal.js";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "mocha";
import { Client } from "pg";

import { closeOrm, getOrm, pgConnectionString } from "@wordpoker/db";
import type { HandRecord } from "@wordpoker/contracts";

import {
  HandRecordConflictError,
  HistoryService,
  HISTORY_DATABASE_URL,
  handRecordDigest,
} from "../src/history/history-service.js";

const serverUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

function record(overrides: Partial<HandRecord> = {}): HandRecord {
  return {
    version: 1,
    sessionId: randomUUID(),
    handNo: 1,
    mode: "online",
    ranked: true,
    startedAtMs: 1_000_000,
    endedAtMs: 2_000_000,
    seed: 42,
    dealerSeat: 0,
    rulesVersion: "1",
    dictionaryId: "en_US-large",
    dictionaryFingerprint: "a".repeat(64),
    config: { smallBlind: 10, bigBlind: 20, turnDurationMs: 60000, autoSubmitDrafts: false, powerUpDeal: "off" },
    seats: [
      { playerId: "hero", userId: "user-1", name: "user-1", initialStack: 1000 },
      { playerId: "ellis", userId: "user-2", name: "user-2", initialStack: 1000 },
    ],
    actions: [
      { sequence: 0, atMs: 1_500_000, source: "player", action: { type: "fold", playerId: "hero" } },
      { sequence: 1, atMs: 1_600_000, source: "timeout", action: { type: "timeoutWords" } },
    ],
    summary: {
      outcome: "fold-out",
      community: Array.from({ length: 5 }, (_, index) => ({ id: `board-${index}`, letter: "A", points: 1 })),
      seats: ["hero", "ellis"].map((playerId) => ({
        playerId, privateTiles: [], submission: null, word: null, score: 0, reason: null,
        place: null, finalStack: playerId === "hero" ? 990 : 1010,
      })),
      pots: [{ amount: 30, eligible: ["ellis"], winners: ["ellis"] }],
    },
    ...overrides,
  };
}

describe("SettlementJournal", () => {
  it("reads valid settlements even when other journal entries are corrupt or invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "history-corrupt-"));
    try {
      const journal = new SettlementJournal(directory);
      const hand = record();
      journal.capture(hand);
      await writeFile(join(directory, "000-corrupt.json"), "{");
      await writeFile(join(directory, "001-invalid.json"), "{}");
      assert.deepStrictEqual(journal.records(), [hand]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("HistoryService (STO-455)", function () {

  let admin: Client;
  let database: string | undefined;
  let schema: string | undefined;
  let historyUrl: string;
  let service: HistoryService;

  before(async function (this: Mocha.Context) {
    this.timeout(30_000);
    if (serverUrl === undefined) this.skip();

    admin = new Client({ connectionString: pgConnectionString(serverUrl) });
    await admin.connect();

    database = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    try {
      await admin.query(`create database "${database}"`);
      const url = new URL(pgConnectionString(serverUrl));
      url.pathname = `/${database}`;
      historyUrl = url.toString();
    } catch {
      // A managed host may refuse `create database`; a run-scoped schema is the same isolation.
      schema = `wordpoker_test_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      await admin.query(`create schema "${schema}"`);
      const url = new URL(pgConnectionString(serverUrl));
      url.searchParams.set("options", `-c search_path=${schema}`);
      historyUrl = url.toString();
      database = undefined;
    }

    const orm = await getOrm(historyUrl);
    await orm.em.getConnection().execute(`create table "user" (id text primary key, name text not null)`);
    await orm.migrator.up();
    service = new HistoryService(orm);
  });

  after(async function (this: Mocha.Context) {
    this.timeout(30_000);
    await closeOrm();
    if (schema !== undefined) await admin.query(`drop schema if exists "${schema}" cascade`);
    if (database !== undefined) await admin.query(`drop database if exists "${database}" with (force)`);
    await admin?.end();
  });

  it("records a settled online hand whole: session, digest, seats and ordered actions", async () => {
    const hand = record();
    assert.strictEqual(await service.recordHand(hand), "recorded");

    const db = (await getOrm(historyUrl)).em.getConnection();
    const [session] = await db.execute<{ mode: string; owner_id: string | null }[]>(
      `select "mode", "owner_id" from "game_session" where "id" = ?`,
      [hand.sessionId],
    );
    assert.ok(session);
    assert.strictEqual(session.mode, "online");
    assert.strictEqual(session.owner_id, null);

    const [row] = await db.execute<{ ranked: boolean; payload_digest: string; summary: unknown }[]>(
      `select "ranked", "payload_digest", "summary" from "game_hand" where "session_id" = ? and "hand_no" = ?`,
      [hand.sessionId, hand.handNo],
    );
    assert.ok(row);
    assert.strictEqual(row.ranked, true);
    assert.strictEqual(row.payload_digest, handRecordDigest(hand));
    assert.deepStrictEqual(row.summary, hand.summary);

    const seats = await db.execute<{ user_id: string }[]>(
      `select "user_id" from "hand_seat" where "hand_id" in
         (select "id" from "game_hand" where "session_id" = ?) order by "seat"`,
      [hand.sessionId],
    );
    assert.deepStrictEqual(seats.map((seat) => seat.user_id), ["user-1", "user-2"]);

    const actions = await db.execute<{ source: string }[]>(
      `select "source" from "hand_action" where "hand_id" in
         (select "id" from "game_hand" where "session_id" = ?) order by "sequence"`,
      [hand.sessionId],
    );
    assert.deepStrictEqual(actions.map((action) => action.source), ["player", "timeout"]);
  });

  it("answers a retried identical payload with one record, never two", async () => {
    const hand = record();
    assert.strictEqual(await service.recordHand(hand), "recorded");
    assert.strictEqual(await service.recordHand(hand), "duplicate");

    const [row] = await (await getOrm(historyUrl)).em.getConnection().execute<{ count: string }[]>(
      `select count(*) as count from "game_hand" where "session_id" = ?`,
      [hand.sessionId],
    );
    assert.strictEqual(Number(row?.count), 1);
  });

  it("serializes concurrent retries and insertion cursors through commit", async () => {
    const hand = record();
    const answers = await Promise.all([service.recordHand(hand), service.recordHand(hand)]);
    assert.deepStrictEqual(answers.sort(), ["duplicate", "recorded"]);
  });

  it("recovers pending and ambiguously committed settlements with no room", async () => {
    const directory = await mkdtemp(join(tmpdir(), "history-recovery-"));
    try {
      const journal = new SettlementJournal(directory);
      const pending = record();
      const committed = record();
      journal.capture(pending);
      journal.capture(committed);
      await service.recordHand(committed); // Committed, but the old process never acknowledged it.
      const restarted = new HistoryService(await getOrm(historyUrl), new SettlementJournal(directory));
      await restarted.recoverPending();
      await restarted.recoverPending();
      assert.deepStrictEqual(journal.records(), []);
      const [row] = await (await getOrm(historyUrl)).em.getConnection().execute<{ count: string }[]>(
        `select count(*) as count from "game_hand" where "session_id" in (?, ?)`,
        [pending.sessionId, committed.sessionId],
      );
      assert.strictEqual(Number(row?.count), 2);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("recovers later entries after a conflicting journal record and retains the conflict", async () => {
    const directory = await mkdtemp(join(tmpdir(), "history-conflict-"));
    try {
      const journal = new SettlementJournal(directory);
      journal.capture(record());
      journal.capture(record());
      const [conflicting, pending] = journal.records();
      await service.recordHand({ ...conflicting, seed: conflicting.seed + 1 });
      const restarted = new HistoryService(await getOrm(historyUrl), journal);
      await restarted.recoverPending();
      assert.deepStrictEqual(journal.records(), [conflicting]);
      const [row] = await (await getOrm(historyUrl)).em.getConnection().execute<{ count: string }[]>(
        `select count(*) as count from "game_hand" where "session_id" = ?`,
        [pending.sessionId],
      );
      assert.strictEqual(Number(row?.count), 1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("refuses a different payload for the same hand instead of overwriting it", async () => {
    const hand = record();
    assert.strictEqual(await service.recordHand(hand), "recorded");

    const conflicting = record({ sessionId: hand.sessionId, seed: hand.seed + 1 });
    await assert.rejects(service.recordHand(conflicting), HandRecordConflictError);

    const [row] = await (await getOrm(historyUrl)).em.getConnection().execute<{ seed: string }[]>(
      `select "seed" from "game_hand" where "session_id" = ?`,
      [hand.sessionId],
    );
    assert.strictEqual(Number(row?.seed), hand.seed, "the stored hand is the one that landed first");
  });

  it("leaves nothing behind when the write fails partway: the transaction is the crash boundary", async () => {
    // Two seats on one account violate `unique (hand_id, user_id)` mid-write, after the session
    // and hand rows have been inserted: exactly the half-written hand a crash must not leave.
    const hand = record({
      seats: [
        { playerId: "hero", userId: "user-1", name: "user-1", initialStack: 1000 },
        { playerId: "ellis", userId: "user-1", name: "user-1", initialStack: 1000 },
      ],
    });
    await assert.rejects(service.recordHand(hand));

    const db = (await getOrm(historyUrl)).em.getConnection();
    const [handCount] = await db.execute<{ count: string }[]>(
      `select count(*) as count from "game_hand" where "session_id" = ?`,
      [hand.sessionId],
    );
    assert.strictEqual(Number(handCount?.count), 0);
    const [sessionCount] = await db.execute<{ count: string }[]>(
      `select count(*) as count from "game_session" where "id" = ?`,
      [hand.sessionId],
    );
    assert.strictEqual(Number(sessionCount?.count), 0, "the session row rolls back with the hand");
  });

  it("is present only when the room server's own env names a database", async function (this: Mocha.Context) {
    this.timeout(10_000);
    const original = process.env[HISTORY_DATABASE_URL];

    delete process.env[HISTORY_DATABASE_URL];
    assert.strictEqual(await HistoryService.fromEnv(), null, "no env, no service: nothing accidental");

    process.env[HISTORY_DATABASE_URL] = historyUrl;
    const originalDirectory = process.env.WORDPOKER_HISTORY_JOURNAL_DIR;
    process.env.WORDPOKER_HISTORY_JOURNAL_DIR = await mkdtemp(join(tmpdir(), "history-env-"));
    const fromEnv = await HistoryService.fromEnv();
    assert.ok(fromEnv, "the env's database gets the service");
    assert.strictEqual(await fromEnv.recordHand(record()), "recorded");

    await rm(process.env.WORDPOKER_HISTORY_JOURNAL_DIR, { recursive: true, force: true });
    if (originalDirectory === undefined) delete process.env.WORDPOKER_HISTORY_JOURNAL_DIR;
    else process.env.WORDPOKER_HISTORY_JOURNAL_DIR = originalDirectory;
    if (original === undefined) delete process.env[HISTORY_DATABASE_URL];
    else process.env[HISTORY_DATABASE_URL] = original;
  });
});
