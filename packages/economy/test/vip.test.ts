/**
 * VIP payouts (STO-1170) over the fake RevenueCat `rewards.test.ts` uses, with in-memory wallet
 * and VIP stores standing in for `db`.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import type { VipHandFacts } from "@wordpoker/contracts";
import type { OpenWalletEventInput, SettleWalletEventInput, VipProgressRecord, WalletEventRecord } from "@wordpoker/db";

import {
  awardVipHand,
  awardVipPurchase,
  createRevenueCatClient,
  creditVipDaily,
  vipState,
  type VipDeps,
  type VipStore,
  type WalletStore,
} from "../src/index";
import { balances, fakeFetch } from "./fake-fetch";

const ONCE = new Set(["vip_tier", "vip_daily", "vip_purchase_bonus"]);

function walletStore(): WalletStore & { rows: WalletEventRecord[] } {
  const rows: WalletEventRecord[] = [];
  return {
    rows,
    async openWalletEvent(input: OpenWalletEventInput) {
      if (ONCE.has(input.kind) && rows.some((r) => r.userId === input.userId && r.kind === input.kind && r.ref === (input.ref ?? null))) {
        return null;
      }
      const row: WalletEventRecord = {
        id: randomUUID(), createdAt: new Date(), userId: input.userId, kind: input.kind, amount: input.amount,
        status: "pending", attempts: 0, lastError: null, balanceAfter: null, productId: input.productId ?? null, ref: input.ref ?? null,
      };
      rows.push(row);
      return row;
    },
    async settleWalletEvent(id: string, input: SettleWalletEventInput) {
      const i = rows.findIndex((r) => r.id === id);
      const row = rows[i];
      if (row) rows[i] = { ...row, status: input.status };
    },
    async pendingWalletEvents() {
      return [];
    },
    async buyInFor() {
      return null;
    },
  };
}

function vipStore(start: Partial<VipProgressRecord> = {}): VipStore & { tokens: Set<string>; rec: VipProgressRecord & { day: string } } {
  const rec = { points: 0, tierPaid: 0, playToday: 0, day: "", ...start };
  const tokens = new Set<string>();
  return {
    rec,
    tokens,
    async vipProgress(_u, day) {
      return { points: rec.points, tierPaid: rec.tierPaid, playToday: rec.day === day ? rec.playToday : 0 };
    },
    async recordVipPoints(_u, token, day, apply) {
      const playToday = rec.day === day ? rec.playToday : 0;
      if (tokens.has(token)) return { points: rec.points, tierPaid: rec.tierPaid, playToday, duplicate: true, added: 0 };
      tokens.add(token);
      const r = apply({ points: rec.points, playToday });
      rec.points += r.added;
      rec.playToday = r.playToday;
      rec.day = day;
      return { points: rec.points, tierPaid: rec.tierPaid, playToday: r.playToday, duplicate: false, added: r.added };
    },
    async setVipTierPaid(_u, tier) {
      rec.tierPaid = Math.max(rec.tierPaid, tier);
    },
  };
}

function deps(vip: VipStore, replies = 6): VipDeps & { store: ReturnType<typeof walletStore> } {
  const fake = fakeFetch(Array.from({ length: replies }, () => balances(100)));
  const client = createRevenueCatClient({ projectId: "p", secretKey: "sk", fetch: fake.fetch, sleep: async () => {} });
  return { client, store: walletStore(), vip, now: new Date("2026-11-25T12:00:00Z") };
}

const HAND: VipHandFacts = {
  completed: true, showdown: true, wordLength: 6, usedEveryTile: false, bestWord: true,
  committed: 140, wonAllIn: false, handInSession: 1, betting: true,
};

describe("awardVipHand", () => {
  it("adds a hand's points once per token", async () => {
    const vip = vipStore();
    const d = deps(vip);
    const first = await awardVipHand("u", "s:1", HAND, d);
    assert.equal(first.added, 44);
    const again = await awardVipHand("u", "s:1", HAND, d);
    assert.equal(again.added, 0);
    assert.equal(vip.rec.points, 44);
  });

  it("pays a tier-up once when a hand crosses the threshold", async () => {
    const vip = vipStore({ points: 1_490 });
    const d = deps(vip);
    const award = await awardVipHand("u", "s:2", HAND, d);
    assert.deepEqual(award.tierUp, { tier: 1, coins: 100 });
    assert.equal(d.store.rows.filter((r) => r.kind === "vip_tier").length, 1);

    const heal = await vipState("u", d);
    assert.equal(heal.tier, 1);
    assert.equal(d.store.rows.filter((r) => r.kind === "vip_tier").length, 1, "no second payment");
  });
});

describe("creditVipDaily", () => {
  it("pays the tier bonus once per UTC day and adds streak points", async () => {
    const vip = vipStore({ points: 8_000, tierPaid: 2 });
    const d = deps(vip);
    const first = await creditVipDaily("u", 3, d);
    assert.equal(first.coins, 60);
    assert.equal(first.award.added, 60);
    const again = await creditVipDaily("u", 3, d);
    assert.equal(again.coins, null);
    assert.equal(again.award.added, 0);
  });
});

describe("awardVipPurchase", () => {
  it("pays the tier's bonus and the pack's points once per event", async () => {
    const vip = vipStore({ points: 8_000, tierPaid: 2 });
    const d = deps(vip);
    const award = await awardVipPurchase("u", { eventId: "ev1", productId: "coins_medium", coins: 1_000 }, d);
    assert.equal(award?.added, 750);
    assert.equal(d.store.rows.find((r) => r.kind === "vip_purchase_bonus")?.amount, 100);

    await awardVipPurchase("u", { eventId: "ev1", productId: "coins_medium", coins: 1_000 }, d);
    assert.equal(d.store.rows.filter((r) => r.kind === "vip_purchase_bonus").length, 1);
    assert.equal(vip.rec.points, 8_750);
  });

  it("ignores events that are not coin packs", async () => {
    const d = deps(vipStore());
    assert.equal(await awardVipPurchase("u", { eventId: "ev2", productId: null, coins: 500 }, d), null);
  });
});
