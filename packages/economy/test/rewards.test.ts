/**
 * The reward paths: the login streak's day math and payout, and a hand's quest claim — over the
 * same fake RevenueCat `wallet.test.ts` uses, plus an in-memory quest store standing in for `db`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { QuestHandClaim, QuestId } from "@wordpoker/contracts";
import type { OpenWalletEventInput, QuestProgressMap, QuestProgressRecord, SettleWalletEventInput, WalletEventRecord } from "@wordpoker/db";
import { emptyQuestProgress } from "@wordpoker/game-rules";
import { randomUUID } from "node:crypto";

import {
  claimQuestHand,
  createRevenueCatClient,
  creditDailyStreak,
  payCompletedQuests,
  streakLength,
  type QuestStore,
  type WalletStore,
} from "../src/index";
import { balances, fakeFetch, type Reply } from "./fake-fetch";

interface MemoryWalletStore extends WalletStore {
  readonly rows: WalletEventRecord[];
}

/** The same shape `wallet.test.ts` uses — the welcome-once rule plus the `quest`/`streak` index. */
function memoryWalletStore(): MemoryWalletStore {
  const rows: WalletEventRecord[] = [];

  return {
    rows,
    async openWalletEvent(input: OpenWalletEventInput) {
      const onceOnly = input.kind === "welcome" || input.kind === "quest" || input.kind === "streak";
      if (onceOnly && rows.some((row) => row.userId === input.userId && row.kind === input.kind && row.ref === (input.ref ?? null))) {
        return null;
      }
      const row: WalletEventRecord = {
        id: randomUUID(),
        createdAt: new Date(),
        userId: input.userId,
        kind: input.kind,
        amount: input.amount,
        status: "pending",
        attempts: 0,
        lastError: null,
        balanceAfter: null,
        productId: input.productId ?? null,
        ref: input.ref ?? null,
      };
      rows.push(row);
      return row;
    },
    async settleWalletEvent(id: string, input: SettleWalletEventInput) {
      const index = rows.findIndex((row) => row.id === id);
      const row = rows[index];
      if (!row) throw new Error(`no row ${id}`);
      rows[index] = {
        ...row,
        status: input.status,
        balanceAfter: input.balanceAfter ?? row.balanceAfter,
        lastError: input.lastError ?? null,
        attempts: row.attempts + 1,
      };
    },
    async pendingWalletEvents(userId: string) {
      return rows.filter((row) => row.userId === userId && row.status === "pending");
    },
  };
}

interface MemoryQuestStore extends QuestStore {
  progress: QuestProgressMap;
  readonly hands: string[];
}

function memoryQuestStore(initial: QuestProgressMap = emptyQuestProgress()): MemoryQuestStore {
  const hands: string[] = [];
  let progress = initial;

  return {
    hands,
    get progress() {
      return progress;
    },
    set progress(next) {
      progress = next;
    },
    async streakDates() {
      return [];
    },
    async recordQuestHand(_userId, handToken, apply) {
      if (hands.includes(handToken)) return { completed: [], duplicate: true };
      hands.push(handToken);
      const { next, completed } = apply(progress);
      progress = next;
      return { completed, duplicate: false };
    },
    async questProgress() {
      return (Object.entries(progress) as [QuestId, QuestProgressMap[QuestId]][]).map(([questId, entry]) => ({
        questId,
        progress: entry.progress,
        streak: entry.streak,
        completedAt: entry.done ? new Date() : null,
      }));
    },
  };
}

function deps(replies: Reply[], quests: QuestStore = memoryQuestStore()) {
  const store = memoryWalletStore();
  const fake = fakeFetch(replies);
  const client = createRevenueCatClient({ projectId: "proj1", secretKey: "sk", fetch: fake.fetch, sleep: async () => {} });

  return { client, store, quests, requests: fake.requests };
}

describe("streakLength", () => {
  it("is 1 for a first-ever day, once today is in the list", () => {
    assert.equal(streakLength(["2026-10-05"], "2026-10-05"), 1);
  });

  it("is 0 when today is not in the list at all", () => {
    assert.equal(streakLength([], "2026-10-05"), 0);
  });

  it("counts backward through consecutive days", () => {
    assert.equal(streakLength(["2026-10-05", "2026-10-04", "2026-10-03"], "2026-10-05"), 3);
  });

  it("stops at the first gap", () => {
    assert.equal(streakLength(["2026-10-05", "2026-10-04", "2026-10-01"], "2026-10-05"), 2);
  });

  it("ignores a duplicate of today", () => {
    assert.equal(streakLength(["2026-10-05", "2026-10-05", "2026-10-04"], "2026-10-05"), 2);
  });
});

describe("creditDailyStreak", () => {
  it("pays day 1 on a first visit", async () => {
    const d = deps([balances(50)]);
    const result = await creditDailyStreak("u1", new Date("2026-10-05T12:00:00Z"), d);

    assert.deepEqual(result, { current: 1, creditedToday: 50 });
    assert.deepEqual(d.store.rows[0] && [d.store.rows[0].kind, d.store.rows[0].amount, d.store.rows[0].ref], [
      "streak",
      50,
      "2026-10-05",
    ]);
  });

  it("pays one more each consecutive day", async () => {
    const quests = memoryQuestStore();
    quests.streakDates = async () => ["2026-10-04"];
    const d = deps([balances(75)], quests);

    const result = await creditDailyStreak("u1", new Date("2026-10-05T12:00:00Z"), d);
    assert.deepEqual(result, { current: 2, creditedToday: 75 });
  });

  it("resets after a gap", async () => {
    const quests = memoryQuestStore();
    quests.streakDates = async () => ["2026-10-01"];
    const d = deps([balances(50)], quests);

    const result = await creditDailyStreak("u1", new Date("2026-10-05T12:00:00Z"), d);
    assert.deepEqual(result, { current: 1, creditedToday: 50 });
  });

  it("wraps the cycle after day 7", async () => {
    const quests = memoryQuestStore();
    quests.streakDates = async () => [
      "2026-10-04",
      "2026-10-03",
      "2026-10-02",
      "2026-10-01",
      "2026-09-30",
      "2026-09-29",
    ];
    const d = deps([balances(50)], quests);

    const result = await creditDailyStreak("u1", new Date("2026-10-05T12:00:00Z"), d);
    assert.deepEqual(result, { current: 7, creditedToday: 300 });
  });

  it("pays nothing on a second credit the same day", async () => {
    const d = deps([balances(50)]);
    await creditDailyStreak("u1", new Date("2026-10-05T12:00:00Z"), d);

    const second = await creditDailyStreak("u1", new Date("2026-10-05T18:00:00Z"), d);
    assert.deepEqual(second, { current: 1, creditedToday: null });
    assert.equal(d.store.rows.length, 1, "no second wallet_event row opened");
  });
});

const FACTS = {
  revealed: true,
  heroWon: true,
  heroWord: "CAT",
  heroScore: 12,
  heroDecidedBy: "final-score" as const,
  pot: 300,
  wildTable: false,
  heroUsedPower: false,
};

function claim(overrides: Partial<QuestHandClaim["facts"]> = {}): QuestHandClaim {
  return { handToken: `token-${randomUUID()}`, facts: { ...FACTS, ...overrides } };
}

describe("claimQuestHand", () => {
  it("pays exactly the catalog reward for each completed quest, once", async () => {
    const d = deps([balances(1000)]);
    const c = claim({ heroWord: "AB" }); // win-word-2, reward 100

    const result = await claimQuestHand("u1", c, d);

    assert.equal(result.duplicate, false);
    assert.deepEqual(result.completed, ["win-word-2"]);
    assert.equal(d.store.rows.length, 1);
    assert.deepEqual([d.store.rows[0]?.kind, d.store.rows[0]?.amount, d.store.rows[0]?.ref], ["quest", 100, "win-word-2"]);
  });

  it("is a no-op for a repeated hand token", async () => {
    const quests = memoryQuestStore();
    const d = deps([balances(1000)], quests);
    const c = claim({ heroWord: "AB" });

    await claimQuestHand("u1", c, d);
    const second = await claimQuestHand("u1", c, d);

    assert.deepEqual(second, { completed: [], duplicate: true });
    assert.equal(d.store.rows.length, 1, "no second wallet_event row for the repeated claim");
  });
});

describe("payCompletedQuests", () => {
  it("pays a done-but-unpaid quest and skips one already paid", async () => {
    const progress = emptyQuestProgress();
    const quests = memoryQuestStore({
      ...progress,
      "win-word-2": { progress: 1, streak: 0, done: true },
      "hands-25": { progress: 1, streak: 0, done: false },
    });
    const d = deps([balances(1000)], quests);

    // Pretend win-word-2's reward was already paid: open its wallet_event row ahead of time.
    await d.store.openWalletEvent({ userId: "u1", kind: "quest", amount: 100, ref: "win-word-2" });

    await payCompletedQuests("u1", d);

    assert.equal(d.store.rows.length, 1, "already-paid quest opens no second row");
  });

  it("pays a quest completed outside a claim (a healed crash)", async () => {
    const progress = { ...emptyQuestProgress(), "win-word-2": { progress: 1, streak: 0, done: true } };
    const quests = memoryQuestStore(progress);
    const d = deps([balances(1000)], quests);

    await payCompletedQuests("u1", d);

    assert.equal(d.store.rows.length, 1);
    assert.deepEqual([d.store.rows[0]?.kind, d.store.rows[0]?.ref], ["quest", "win-word-2"]);
  });
});
