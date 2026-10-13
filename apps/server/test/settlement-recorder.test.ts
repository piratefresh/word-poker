/**
 * settlement-recorder.test.ts — STO-455: what the room's durability hold does when the write
 * fails, retries, duplicates, or can never happen.
 *
 * The recorder is the room's whole durability policy, so its unit tests drive it directly with
 * fake writers and a controllable clock: a real database is not what these tests are about (the
 * history-service and room suites cover the real write), and a fake is what makes the backoff
 * and hold observable in milliseconds.
 */
import assert from "assert";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettlementJournal } from "../src/history/settlement-journal.js";
import type { HandRecord } from "@wordpoker/contracts";

import { SettlementRecorder } from "../src/history/settlement-recorder.js";
import type { SettledHand } from "../src/rooms/AuthoritativeGame.js";

/** A settled hand stand-in: the recorder never reads it, only hands it to `build`. */
const SETTLED = {} as SettledHand;

function record(handNo: number): HandRecord {
  return {
    version: 1,
    sessionId: "b2bc3c57-bc1d-4aa4-9aab-7432ac455600",
    handNo,
    mode: "online",
    ranked: true,
    startedAtMs: 1000,
    endedAtMs: 2000,
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
    actions: [{ sequence: 0, atMs: 2000, source: "player", action: { type: "fold", playerId: "hero" } }],
    summary: {
      outcome: "fold-out",
      community: Array.from({ length: 5 }, (_, index) => ({ id: `board-${index}`, letter: "A", points: 1 })),
      seats: ["hero", "ellis"].map((playerId) => ({
        playerId, privateTiles: [], submission: null, word: null, score: 0, reason: null,
        place: null, finalStack: playerId === "hero" ? 990 : 1010,
      })),
      pots: [{ amount: 30, eligible: ["ellis"], winners: ["ellis"] }],
    },
  };
}

/** Lets the recorder's in-flight write settle before the test reads its state: microtasks
 * only, so the flush costs nothing and cannot flake on real time. */
const settled = async () => {
  for (let step = 0; step < 10; step += 1) await Promise.resolve();
};

describe("SettlementRecorder (STO-455)", () => {
  it("recovers a settlement after the capturing process is killed before its DB write", async function () {
    this.timeout(10_000);
    const directory = await mkdtemp(join(tmpdir(), "settlement-crash-"));
    const hand = record(1);
    const journalUrl = new URL("../src/history/settlement-journal.ts", import.meta.url).href;
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { SettlementJournal } from ${JSON.stringify(journalUrl)};
      new SettlementJournal(process.argv[1]).capture(JSON.parse(process.argv[2]));
      process.stdout.write("captured");
      setInterval(() => {}, 1000);
    `, directory, JSON.stringify(hand)], { stdio: ["ignore", "pipe", "pipe"] });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code) => reject(new Error(`capture process exited early: ${code}`)));
        child.stdout.once("data", () => resolve());
      });
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGKILL");
      await exited;
      const restarted = new SettlementJournal(directory);
      assert.deepStrictEqual(restarted.records(), [hand]);
      restarted.acknowledge(hand);
      assert.deepStrictEqual(new SettlementJournal(directory).records(), []);
    } finally {
      child.kill();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("stages before publication and retains the hand when the DB write fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "settlement-outage-"));
    try {
      const journal = new SettlementJournal(directory);
      const recorder = new SettlementRecorder({
        build: () => record(1),
        write: {
          stageHand: (hand) => journal.capture(hand),
          recordHand: async () => { throw new Error("database outage"); },
        },
        now: () => 0,
      });
      recorder.observe(SETTLED);
      assert.deepStrictEqual(new SettlementJournal(directory).records(), [record(1)]);
      await settled();
      assert.strictEqual(recorder.pending, true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("holds and retries staging failures without rejecting the accepted action", async () => {
    let clock = 0;
    let fail = true;
    let writes = 0;
    const recorder = new SettlementRecorder({
      build: () => record(1),
      write: {
        stageHand: () => { if (fail) throw new Error("disk unavailable"); },
        recordHand: async () => { writes += 1; return "recorded"; },
      },
      now: () => clock,
    });
    assert.doesNotThrow(() => recorder.observe(SETTLED));
    assert.strictEqual(recorder.pending, true);
    assert.strictEqual(writes, 0);
    fail = false;
    clock = 10_000;
    recorder.tick();
    await recorder.idle();
    assert.strictEqual(writes, 1);
  });

  it("records a settled hand once and is durable immediately after", async () => {
    const written: number[] = [];
    const recorder = new SettlementRecorder({
      build: () => record(1),
      write: {
        recordHand: async (hand) => {
          written.push(hand.handNo);
          return "recorded";
        },
      },
      now: () => 0,
    });

    recorder.observe(SETTLED);
    await settled();

    assert.deepStrictEqual(written, [1]);
    assert.strictEqual(recorder.pending, false);
    await recorder.idle();
  });

  it("holds the room through a failed write and retries on the tick, with backoff", async () => {
    let clock = 0;
    let failures = 2;
    const attempts: number[] = [];
    const recorder = new SettlementRecorder({
      build: () => record(1),
      write: {
        recordHand: async () => {
          attempts.push(clock);
          if (failures > 0) {
            failures -= 1;
            throw new Error("database is down");
          }
          return "recorded";
        },
      },
      now: () => clock,
      retryDelayMs: (attempt) => 100 * attempt,
      log: () => {},
    });

    recorder.observe(SETTLED);
    await settled();
    assert.strictEqual(recorder.pending, true, "the settlement is undurable while the write fails");

    // The room's ticks before the backoff elapses do not hammer a down database.
    clock = 50;
    recorder.tick();
    await settled();
    assert.strictEqual(attempts.length, 1, "the retry waits out its backoff");

    clock = 100;
    recorder.tick();
    await settled();
    assert.strictEqual(attempts.length, 2, "the first retry happens when the backoff elapses");
    assert.strictEqual(recorder.pending, true, "a second failure still holds the room");

    clock = 300;
    recorder.tick();
    await settled();
    assert.strictEqual(attempts.length, 3);
    assert.strictEqual(recorder.pending, false, "the successful retry makes the settlement durable");
    await recorder.idle();
  });

  it("treats a duplicate as durable: the write landed, only its answer was lost", async () => {
    const recorder = new SettlementRecorder({
      build: () => record(1),
      write: { recordHand: async () => "duplicate" },
      now: () => 0,
    });

    recorder.observe(SETTLED);
    await settled();

    assert.strictEqual(recorder.pending, false);
  });

  it("holds the room forever on a record it cannot build, without ever writing", async () => {
    const writes: unknown[] = [];
    const logged: string[] = [];
    const recorder = new SettlementRecorder({
      build: () => {
        throw new Error("record building is broken");
      },
      write: {
        recordHand: async (hand) => {
          writes.push(hand);
          return "recorded";
        },
      },
      now: () => 0,
      log: (message) => logged.push(message),
    });

    recorder.observe(SETTLED);
    recorder.tick();
    recorder.tick();
    await settled();

    assert.deepStrictEqual(writes, [], "a malformed record is never written");
    assert.strictEqual(recorder.pending, true, "a build bug blocks advancement rather than losing the hand");
    assert.strictEqual(logged.length, 1);
  });

  it("holds the room forever on a malformed record, without ever writing", async () => {
    // An intentionally broken builder's output: unchecked because the point is that the
    // recorder must reject exactly this shape.
    const malformed = { version: 99 } as unknown as HandRecord;
    const recorder = new SettlementRecorder({
      build: () => malformed,
      write: { recordHand: async () => "recorded" },
      now: () => 0,
      log: () => {},
    });

    recorder.observe(SETTLED);
    await settled();

    assert.strictEqual(recorder.pending, true);
  });

  it("writes a second settlement that arrives while one is held, in order", async () => {
    const written: number[] = [];
    let clock = 0;
    let failures = 1;
    let settledHandNo = 1;
    const recorder = new SettlementRecorder({
      build: () => record(settledHandNo),
      write: {
        recordHand: async (hand) => {
          if (failures > 0) {
            failures -= 1;
            throw new Error("database is down");
          }
          written.push(hand.handNo);
          return "recorded";
        },
      },
      now: () => clock,
      log: () => {},
    });

    recorder.observe(SETTLED);
    await settled();
    settledHandNo = 2;
    recorder.observe(SETTLED);
    await settled();

    clock = 10_000;
    recorder.tick();
    await settled();

    assert.deepStrictEqual(written, [1, 2], "the held hand is written first, the queued one after it");
    assert.strictEqual(recorder.pending, false);
  });
});
