import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { GameHand, GameSession, HandAction, HandSeat } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

describe("game history migration", { skip: !serverUrl && "no test database configured" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  const sessionId = randomUUID();
  const handId = randomUUID();

  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "game history");
    orm = await openRunOrm(target);
    await orm.migrator.up();
  });

  after(async () => {
    await orm?.close(true);
    await target?.drop(admin);
    await admin?.end();
  });

  function sql<Row = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<Row[]> {
    return orm.em.getConnection().execute<Row[]>(query, params);
  }

  function insertHand(id: string, handNo: number, endedAt: string, ranked = false, session = sessionId, mode = "offline") {
    return sql(`insert into game_hand
      (id, session_id, mode, hand_no, started_at, ended_at, version, ranked, seed, dealer_seat,
       rules_version, dictionary_id, dictionary_fingerprint, payload_digest, config, summary)
      values (?, ?, ?, ?, '2026-10-01', ?, 1, ?, 42, 0, '1', 'en_US-large', ?, ?, '{}', '{}')`,
    [id, session, mode, handNo, endedAt, ranked, "a".repeat(64), "b".repeat(64)]);
  }

  it("stores session, hand, ordered actions and account membership through registered entities", async () => {
    const em = orm.em.fork();
    const session = em.create(GameSession, { id: sessionId, mode: "offline", ownerId: "owner" });
    const newHand = em.create(GameHand, {
      id: handId, session, mode: "offline", handNo: 1, version: 1, ranked: false, seed: 42, dealerSeat: 0,
      startedAt: new Date("2026-10-01"), endedAt: new Date("2026-10-03"), rulesVersion: "1",
      dictionaryId: "en_US-large", dictionaryFingerprint: "a".repeat(64), payloadDigest: "b".repeat(64),
      config: { smallBlind: 10, bigBlind: 20, turnDurationMs: 60000, autoSubmitDrafts: false, powerUpDeal: "off" },
      summary: { outcome: "fold-out", community: [], seats: [], pots: [] },
    });
    const seat = em.create(HandSeat, { hand: newHand, seat: 0, playerId: "hero", userId: "owner", name: "Hero", initialStack: 1000 });
    const action = em.create(HandAction, { hand: newHand, sequence: 0, at: new Date("2026-10-03"), source: "timeout", action: { type: "timeoutWords" } });
    em.persist([session, newHand, seat, action]);
    await em.flush();
    em.clear();
    assert.equal((await em.findOneOrFail(GameSession, { id: sessionId })).ownerId, "owner");
    const hand = await em.findOneOrFail(GameHand, { id: handId });
    assert.ok(BigInt(hand.insertionCursor) > 0n);
    assert.equal((await em.findOneOrFail(HandSeat, { hand: handId, seat: 0 })).initialStack, 1000);
    assert.deepEqual((await em.findOneOrFail(HandAction, { hand: handId, sequence: 0 })).action, { type: "timeoutWords" });
  });

  it("rejects duplicate hand/seat/action identities, orphan rows and ranked offline hands", async () => {
    await assert.rejects(insertHand(randomUUID(), 1, "2026-10-03"), /unique/i);
    await assert.rejects(insertHand(randomUUID(), 2, "2026-10-03", true), /check/i);
    await assert.rejects(insertHand(randomUUID(), 2, "2026-10-03", false, randomUUID()), /foreign key/i);
    await assert.rejects(insertHand(randomUUID(), 2, "2026-10-03", true, sessionId, "online"), /foreign key/i);
    await assert.rejects(sql("update game_session set mode = 'online', owner_id = null where id = ?", [sessionId]), /foreign key/i);
    await assert.rejects(sql("insert into hand_seat (hand_id, seat, player_id, name, initial_stack) values (?, 0, 'other', 'Other', 1000)", [handId]), /unique/i);
    await assert.rejects(sql("insert into hand_seat (hand_id, seat, player_id, user_id, name, initial_stack) values (?, 1, 'twin', 'owner', 'Twin', 1000)", [handId]), /unique/i);
    await sql("insert into hand_seat (hand_id, seat, player_id, name, initial_stack) values (?, 1, 'cpu-1', 'CPU', 1000), (?, 2, 'cpu-2', 'CPU', 1000)", [handId, handId]);
    await assert.rejects(sql("insert into hand_action (hand_id, sequence, at, source, action) values (?, 0, now(), 'player', '{}')", [handId]), /unique/i);
    await assert.rejects(sql("insert into hand_action (hand_id, sequence, at, source, action) values (?, 1, now(), 'player', '{}')", [randomUUID()]), /foreign key/i);
  });

  it("uses insertion order for equal end times and delayed uploads, with account join indexes", async () => {
    await insertHand(randomUUID(), 2, "2026-10-03");
    await insertHand(randomUUID(), 3, "2026-10-02");
    const rows = await sql<{ hand_no: number }>("select hand_no, insertion_cursor from game_hand order by insertion_cursor");
    assert.deepEqual(rows.map((row) => row.hand_no), [1, 2, 3]);
    const indexes = await sql<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = current_schema() and tablename in ('game_hand', 'hand_seat')");
    assert.ok(indexes.some((row) => row.indexdef.includes("(user_id, hand_id)")));
    assert.ok(indexes.some((row) => row.indexdef.includes("(ended_at DESC, id)")));
    assert.ok(indexes.some((row) => row.indexdef.includes("(insertion_cursor)")));
  });

  it("deletes a session's hands, seats and actions with it", async () => {
    await sql("delete from game_session where id = ?", [sessionId]);
    for (const table of ["game_hand", "hand_seat", "hand_action"]) {
      assert.deepEqual(await sql(`select 1 from ${table}`), [], table);
    }
  });

  it("rolls back all history tables", async () => {
    await orm.migrator.down({ to: "Migration20261006120000_xp_levels" });
    const rows = await sql("select tablename from pg_tables where schemaname = current_schema() and tablename in ('game_session', 'game_hand', 'hand_seat', 'hand_action')");
    assert.deepEqual(rows, []);
  });
});
