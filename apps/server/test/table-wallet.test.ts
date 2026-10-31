import assert from "assert";

import { InsufficientCoinsError, RevenueCatError, type RevenueCatClient, type WalletStore } from "@wordpoker/economy";
import type { WalletEventRecord } from "@wordpoker/db";

import { createTableWallet } from "../src/wallet/table-wallet.js";

/** An in-memory wallet_event log with the table index: one `buy_in` and one `cash_out` per ref. */
function memoryStore() {
  const rows: WalletEventRecord[] = [];
  const store: WalletStore = {
    async openWalletEvent(input) {
      if (rows.some((row) => row.userId === input.userId && row.kind === input.kind && row.ref === input.ref)) return null;
      const row: WalletEventRecord = {
        id: `row-${rows.length + 1}`,
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
    async settleWalletEvent(id, input) {
      const index = rows.findIndex((row) => row.id === id);
      rows[index] = { ...rows[index], status: input.status };
    },
    async pendingWalletEvents(userId) {
      return rows.filter((row) => row.userId === userId && row.status === "pending");
    },
    async buyInFor(userId, ref) {
      return rows.find((row) => row.userId === userId && row.kind === "buy_in" && row.ref === ref) ?? null;
    },
  };
  return { rows, store };
}

function client(adjust: RevenueCatClient["adjustCoins"]): RevenueCatClient {
  return { adjustCoins: adjust, getCoinBalance: async () => 0, listCoinGrants: async () => [], deleteCustomer: async () => {} };
}

describe("table wallet (balances §4, §5)", () => {
  it("pays a buy-in the Wallet covers", async () => {
    const { rows, store } = memoryStore();
    const wallet = createTableWallet({ store, client: client(async () => 4500) });

    assert.equal(await wallet.buyIn("ada", 500, "room:seat"), "paid");
    assert.deepEqual(rows.map((row) => [row.kind, row.amount, row.status]), [["buy_in", -500, "applied"]]);
  });

  it("refuses a buy-in the Wallet cannot cover", async () => {
    const { store } = memoryStore();
    const wallet = createTableWallet({ store, client: client(async () => { throw new InsufficientCoinsError(); }) });

    assert.equal(await wallet.buyIn("ada", 500, "room:seat"), "insufficient");
  });

  it("pays back a pending buy-in under the same ref, so the retries net to nothing", async () => {
    const { rows, store } = memoryStore();
    const wallet = createTableWallet({ store, client: client(async () => { throw new RevenueCatError(0); }) });

    assert.equal(await wallet.buyIn("ada", 500, "room:seat"), "unavailable");
    assert.deepEqual(
      rows.map((row) => [row.kind, row.amount, row.ref, row.status]),
      [["buy_in", -500, "room:seat", "pending"], ["cash_out", 500, "room:seat", "pending"]],
    );
  });

  it("pays back a buy-in whose outcome is unknown, once it is known to have applied", async () => {
    const { rows, store } = memoryStore();
    let settles = 0;
    const flaky: WalletStore = {
      ...store,
      async settleWalletEvent(id, input) {
        settles += 1;
        if (settles === 1) throw new Error("database blinked");
        return store.settleWalletEvent(id, input);
      },
    };
    const wallet = createTableWallet({ store: flaky, client: client(async () => 4500) });

    assert.equal(await wallet.buyIn("ada", 500, "room:seat"), "unavailable");
    assert.deepEqual(
      rows.map((row) => [row.kind, row.ref, row.status]),
      [["buy_in", "room:seat", "pending"], ["cash_out", "room:seat", "pending"]],
    );
  });

  it("cashes a seat out once, and nothing for an empty stack", async () => {
    const { rows, store } = memoryStore();
    const wallet = createTableWallet({ store, client: client(async () => 5000) });

    await wallet.buyIn("ada", 500, "room:seat");
    await wallet.cashOut("ada", 0, "room:empty");
    await wallet.cashOut("ada", 750, "room:seat");
    await wallet.cashOut("ada", 750, "room:seat");
    assert.deepEqual(rows.slice(1).map((row) => [row.kind, row.amount, row.ref]), [["cash_out", 750, "room:seat"]]);
  });

  it("keeps trying to record a cash-out the database could not take", async () => {
    const { rows, store } = memoryStore();
    let opens = 0;
    const flaky: WalletStore = {
      ...store,
      async openWalletEvent(input) {
        opens += 1;
        if (input.kind === "cash_out" && opens < 4) throw new Error("database down");
        return store.openWalletEvent(input);
      },
    };
    const waits: number[] = [];
    const wallet = createTableWallet({ store: flaky, client: client(async () => 5000) }, async (ms) => {
      waits.push(ms);
    });

    await wallet.buyIn("ada", 500, "room:seat");
    await wallet.cashOut("ada", 750, "room:seat");
    assert.deepEqual(waits, [1000, 2000]);
    assert.deepEqual(rows.map((row) => [row.kind, row.status]), [["buy_in", "applied"], ["cash_out", "applied"]]);
  });
});
