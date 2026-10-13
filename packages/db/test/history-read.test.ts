import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import type { MikroORM } from "@mikro-orm/postgresql";
import { Client } from "pg";
import { isHistoryPage, type HandRecord } from "@wordpoker/contracts";
import { saveHistoryHand, readHistoryHands, readHistoryHand, HandRecordConflictError } from "../src/index";
import { createRunTarget, openRunOrm, serverUrl, type RunTarget } from "./run-target";

describe("history account isolation and insertion pagination", { skip: !serverUrl && "no test database configured" }, () => {
  let admin: Client;
  let target: RunTarget;
  let orm: MikroORM;
  before(async () => {
    admin = new Client({ connectionString: serverUrl });
    await admin.connect();
    target = await createRunTarget(admin, "history reads");
    orm = await openRunOrm(target);
    await orm.migrator.up();
  });
  after(async () => { await orm?.close(true); await target?.drop(admin); await admin?.end(); });

  function record(endedAtMs = 2000): HandRecord {
    const tiles = [{ id: "private", letter: "A", points: 1 }];
    return {
      version: 1, sessionId: randomUUID(), handNo: 1, mode: "offline", ranked: false,
      startedAtMs: 1000, endedAtMs, seed: 42, dealerSeat: 0, rulesVersion: "1",
      dictionaryId: "en_US-large", dictionaryFingerprint: "a".repeat(64),
      config: { smallBlind: 10, bigBlind: 20, turnDurationMs: 60000, autoSubmitDrafts: false, powerUpDeal: "off" },
      seats: [{ playerId: "hero", userId: "a", name: "Hero", initialStack: 1000 }, { playerId: "bot", userId: null, name: "Bot", initialStack: 1000 }],
      actions: [{ sequence: 0, atMs: 1100, source: "player", action: { type: "fold", playerId: "hero" } }],
      summary: {
        outcome: "fold-out", community: Array.from({ length: 5 }, (_, i) => ({ id: `board-${i}`, letter: "A", points: 1 })),
        seats: ["hero", "bot"].map((playerId) => ({ playerId, privateTiles: tiles, submission: null, word: null, score: 0, reason: null, place: null, finalStack: playerId === "hero" ? 990 : 1010 })),
        pots: [{ amount: 30, eligible: ["bot"], winners: ["bot"] }],
      },
    };
  }

  it("deduplicates ambiguous retries, scopes identities, hides secrets and fetches equal/delayed end times", async () => {
    const first = record();
    const saved = await saveHistoryHand(first, { ownerId: "a", orm });
    const reordered = Object.fromEntries(Object.entries(first).reverse()) as unknown as HandRecord;
    assert.equal((await saveHistoryHand(reordered, { ownerId: "a", orm })).id, saved.id);
    await assert.rejects(saveHistoryHand(first, { ownerId: "b", orm }), HandRecordConflictError);
    await assert.rejects(saveHistoryHand({ ...first, seed: 43 }, { ownerId: "a", orm }), HandRecordConflictError);
    await saveHistoryHand(record(), { ownerId: "a", orm });
    await saveHistoryHand(record(1500), { ownerId: "a", orm });
    const page = await readHistoryHands("a", null, { orm, limit: 1 });
    assert.ok(isHistoryPage(page));
    assert.equal(page.hands.length, 1);
    assert.equal(page.hasMore, true);
    const second = await readHistoryHands("a", page.cursor, { orm, limit: 1 });
    const third = await readHistoryHands("a", second.cursor, { orm, limit: 1 });
    assert.equal(third.hands[0]?.endedAtMs, 1500);
    assert.equal(third.hasMore, false);
    assert.equal((await readHistoryHands("b", null, { orm })).hands.length, 0);
    assert.equal(await readHistoryHand("b", saved.id, { orm }), null);
    const detail = await readHistoryHand("a", saved.id, { orm });
    assert.equal(detail?.summary.seats[1]?.privateTiles.length, 0);
    assert.equal(detail?.summary.seats[0]?.privateTiles.length, 1);
    assert.ok(detail && !("seed" in detail));
    assert.equal(detail?.summary.community.length, 0);
  });
});
