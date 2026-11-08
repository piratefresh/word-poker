/**
 * The rewarded-ad daily cap: what is left today, and the take-back past the cap.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ReportedWalletEventInput, WalletEventRecord } from "@wordpoker/db";

import { adRewardsLeft, enforceAdRewardCap, type RevenueCatClient, type WalletStore } from "../src/index";

const NOW = new Date("2026-11-08T23:30:00.000Z");

const grant: ReportedWalletEventInput = {
  userId: "u1",
  kind: "ad_reward",
  amount: 20,
  productId: null,
  rcEventId: "evt-11",
  rcTransactionId: null,
};

function harness(used: number) {
  const sent: { amount: number; key: string }[] = [];
  const seenSince: Date[] = [];
  const store = {
    async openWalletEvent(input) {
      return { id: `row-${input.ref}`, userId: input.userId, kind: input.kind, amount: input.amount, ref: input.ref ?? null } as WalletEventRecord;
    },
    async settleWalletEvent() {},
    async pendingWalletEvents() {
      return [];
    },
    async buyInFor() {
      return null;
    },
  } satisfies WalletStore;
  const client = {
    async adjustCoins(_userId: string, amount: number, key: string) {
      sent.push({ amount, key });
      return 100;
    },
  } as unknown as RevenueCatClient;
  const adRewardsSince = async (_userId: string, since: Date) => {
    seenSince.push(since);
    return used;
  };

  return { deps: { store, client, adRewardsSince }, sent, seenSince };
}

describe("adRewardsLeft", () => {
  it("counts from midnight UTC and never goes below zero", async () => {
    const h = harness(3);
    assert.equal(await adRewardsLeft("u1", NOW, h.deps), 7);
    assert.equal(h.seenSince[0]?.toISOString(), "2026-11-08T00:00:00.000Z");
    assert.equal(await adRewardsLeft("u1", NOW, harness(12).deps), 0);
  });
});

describe("enforceAdRewardCap", () => {
  it("leaves the 10th grant of the day alone", async () => {
    const h = harness(10);
    assert.equal(await enforceAdRewardCap(grant, NOW, h.deps), null);
    assert.deepEqual(h.sent, []);
  });

  it("takes the 11th grant back under its event's row", async () => {
    const h = harness(11);
    const result = await enforceAdRewardCap(grant, NOW, h.deps);
    assert.deepEqual(result, { applied: true, balance: 100 });
    assert.deepEqual(h.sent, [{ amount: -20, key: "row-evt-11" }]);
  });

  it("ignores rows that are not an ad grant", async () => {
    const h = harness(50);
    assert.equal(await enforceAdRewardCap({ ...grant, kind: "purchase" }, NOW, h.deps), null);
    assert.equal(await enforceAdRewardCap({ ...grant, amount: -20 }, NOW, h.deps), null);
    assert.deepEqual(h.sent, []);
  });
});
