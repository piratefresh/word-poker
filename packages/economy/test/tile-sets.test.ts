/**
 * Buying and wearing tile sets (STO-1045): over an in-memory wallet log that keeps the
 * once-per-set rule the database's `wallet_event_tile_set_once` index keeps, and a fake
 * RevenueCat that answers each spend in turn.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import type { TileSetId } from "@wordpoker/contracts";
import type { OpenWalletEventInput, SettleWalletEventInput, WalletEventRecord } from "@wordpoker/db";

import {
  buyTileSet,
  createRevenueCatClient,
  equipTileSet,
  readTileSets,
  type TileSetStore,
  type WalletStore,
} from "../src/index";
import { balances, fakeFetch, rcError, type Reply } from "./fake-fetch";

function stores() {
  const rows: WalletEventRecord[] = [];
  const equipped = new Map<string, string>();

  const wallet: WalletStore = {
    async openWalletEvent(input: OpenWalletEventInput) {
      const live = rows.some(
        (row) => row.userId === input.userId && row.kind === "tile_set" && row.ref === input.ref && row.status !== "failed",
      );
      if (input.kind === "tile_set" && live) return null;
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
        productId: null,
        ref: input.ref ?? null,
      };
      rows.push(row);
      return row;
    },
    async settleWalletEvent(id: string, input: SettleWalletEventInput) {
      const index = rows.findIndex((row) => row.id === id);
      rows[index] = { ...rows[index]!, status: input.status, balanceAfter: input.balanceAfter ?? null };
    },
    async pendingWalletEvents() {
      return [];
    },
    async buyInFor() {
      return null;
    },
  };

  const tileSets: TileSetStore = {
    async tileSetPurchases(userId) {
      return Object.fromEntries(
        rows
          .filter((row) => row.userId === userId && row.kind === "tile_set" && row.status !== "failed")
          .map((row) => [row.ref!, row.status]),
      );
    },
    async equippedTileSet(userId) {
      return equipped.get(userId) ?? null;
    },
    async setEquippedTileSet(userId, tileSet: TileSetId) {
      equipped.set(userId, tileSet);
    },
  };

  return { rows, equipped, wallet, tileSets };
}

function deps(replies: Reply[], s = stores()) {
  const fake = fakeFetch(replies);
  const client = createRevenueCatClient({ projectId: "proj1", secretKey: "sk", fetch: fake.fetch, sleep: async () => {} });

  return { ...s, client, store: s.wallet, requests: fake.requests };
}

describe("readTileSets", () => {
  it("gives a new player the default set, owned and worn", async () => {
    assert.deepEqual(await readTileSets("u1", deps([])), { owned: ["ivory"], equipped: "ivory" });
  });

  it("reads a worn set the player does not own, or an unknown one, as the default", async () => {
    const d = deps([]);
    d.equipped.set("u1", "midnight");
    assert.equal((await readTileSets("u1", d)).equipped, "ivory");
    d.equipped.set("u1", "gold");
    assert.equal((await readTileSets("u1", d)).equipped, "ivory");
  });
});

describe("buyTileSet", () => {
  it("takes the price, owns the set, puts it on and reports the balance", async () => {
    const d = deps([balances(4775)]);

    assert.deepEqual(await buyTileSet("u1", "midnight", d), {
      ok: true,
      state: { owned: ["ivory", "midnight"], equipped: "midnight", coins: 4775 },
    });
    const [row] = d.rows;
    assert.equal(row?.kind, "tile_set");
    assert.equal(row?.amount, -4000);
    assert.equal(row?.ref, "midnight");
    assert.equal(row?.status, "applied");
    assert.deepEqual(await readTileSets("u1", d), { owned: ["ivory", "midnight"], equipped: "midnight" });
  });

  it("refuses when the Wallet is short, owns nothing, and lets the player try again", async () => {
    const d = deps([rcError(422, "unprocessable_entity_error"), balances(100)]);

    assert.deepEqual(await buyTileSet("u1", "neon-alley", d), { ok: false, reason: "insufficient_coins" });
    assert.deepEqual(await readTileSets("u1", d), { owned: ["ivory"], equipped: "ivory" });

    const retry = await buyTileSet("u1", "neon-alley", d);
    assert.ok(retry.ok);
    assert.equal(d.rows.length, 2);
  });

  it("charges nothing for a set the player already owns, and just equips it", async () => {
    const d = deps([balances(5500)]);
    await buyTileSet("u1", "jade", d);
    await equipTileSet("u1", "ivory", d);

    assert.deepEqual(await buyTileSet("u1", "jade", d), { ok: true, state: { owned: ["ivory", "jade"], equipped: "jade" } });
    assert.equal(d.requests.length, 1, "one spend, for the first purchase");
    assert.equal(d.rows.length, 1);
  });

  it("reports a purchase the Wallet has not answered as pending, and does not charge it again", async () => {
    const d = deps(["network"]);

    assert.deepEqual(await buyTileSet("u1", "rosewood", d), { ok: false, reason: "pending" });
    assert.deepEqual(await buyTileSet("u1", "rosewood", d), { ok: false, reason: "pending" });
    assert.equal(d.rows.length, 1);
    assert.equal((await readTileSets("u1", d)).equipped, "ivory");
  });

  it("buys the default set for free by equipping it", async () => {
    const d = deps([]);
    assert.deepEqual(await buyTileSet("u1", "ivory", d), { ok: true, state: { owned: ["ivory"], equipped: "ivory" } });
    assert.equal(d.requests.length, 0);
  });
});

describe("equipTileSet", () => {
  it("refuses a set the player has not bought", async () => {
    assert.deepEqual(await equipTileSet("u1", "jade", deps([])), { ok: false, reason: "not_owned" });
  });

  it("switches between owned sets", async () => {
    const d = deps([balances(6000), balances(3000)]);
    await buyTileSet("u1", "jade", d);
    await buyTileSet("u1", "rosewood", d);

    assert.deepEqual(await equipTileSet("u1", "jade", d), {
      ok: true,
      state: { owned: ["ivory", "jade", "rosewood"], equipped: "jade" },
    });
  });
});
