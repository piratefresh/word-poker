/**
 * The wallet path: log, send with the row id as the key, settle — over an in-memory store that
 * keeps the welcome-once rule the database's index keeps.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import type { OpenWalletEventInput, SettleWalletEventInput, WalletEventRecord } from "@wordpoker/db";

import { applyWalletChange, createRevenueCatClient, grantWelcome, retryPending, type WalletStore } from "../src/index";
import { balances, fakeFetch, rcError, type Reply } from "./fake-fetch";

interface MemoryStore extends WalletStore {
  readonly rows: WalletEventRecord[];
}

function memoryStore(): MemoryStore {
  const rows: WalletEventRecord[] = [];

  return {
    rows,
    async openWalletEvent(input: OpenWalletEventInput) {
      if (input.kind === "welcome" && rows.some((row) => row.userId === input.userId && row.kind === "welcome")) {
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
    async buyInFor(userId: string, ref: string) {
      return rows.find((row) => row.userId === userId && row.kind === "buy_in" && row.ref === ref) ?? null;
    },
  };
}

function deps(replies: Reply[], store = memoryStore()) {
  const fake = fakeFetch(replies);
  const client = createRevenueCatClient({ projectId: "proj1", secretKey: "sk", fetch: fake.fetch, sleep: async () => {} });

  return { client, store, requests: fake.requests };
}

describe("applyWalletChange", () => {
  it("logs, sends the row id as the key, and settles applied with the balance", async () => {
    const d = deps([balances(5000)]);

    assert.deepEqual(await applyWalletChange("u1", "adjustment", 5000, { ref: "test" }, d), { applied: true, balance: 5000 });
    const [row] = d.store.rows;
    assert.equal(d.requests[0]?.headers["Idempotency-Key"], row?.id);
    assert.equal(row?.status, "applied");
    assert.equal(row?.balanceAfter, 5000);
    assert.equal(row?.attempts, 1);
    assert.equal(row?.ref, "test");
  });

  it("settles failed on a 422", async () => {
    const d = deps([rcError(422, "unprocessable_entity_error")]);

    assert.deepEqual(await applyWalletChange("u1", "buy_in", -10_000, {}, d), {
      applied: false,
      reason: "insufficient_coins",
    });
    assert.equal(d.store.rows[0]?.status, "failed");
  });

  it("settles failed when RevenueCat refuses the idempotency key", async () => {
    const d = deps([rcError(409, "idempotency_error")]);

    assert.deepEqual(await applyWalletChange("u1", "adjustment", 1, {}, d), { applied: false, reason: "rejected" });
    assert.deepEqual([d.store.rows[0]?.status, d.store.rows[0]?.lastError], ["failed", "http_409_idempotency_error"]);
  });

  it("leaves the row pending with a short code on a 5xx, a 429 or a network failure", async () => {
    const limited = { ...rcError(429, "rate_limit_error"), headers: { "Retry-After": "60" } };
    const d = deps([rcError(503, "server_error"), limited, "network"]);

    for (const _ of [1, 2, 3]) {
      assert.deepEqual(await applyWalletChange("u1", "adjustment", 1, {}, d), { applied: false, reason: "pending" });
    }
    assert.deepEqual(
      d.store.rows.map((row) => [row.status, row.lastError]),
      [
        ["pending", "http_503_server_error"],
        ["pending", "http_429_rate_limit_error"],
        ["pending", "network"],
      ],
    );
  });

  it("leaves the row pending when RevenueCat is not configured", async () => {
    const store = memoryStore();
    const saved = { ...process.env };
    delete process.env.REVENUECAT_PROJECT_ID;
    try {
      assert.deepEqual(await applyWalletChange("u1", "adjustment", 1, {}, { store }), { applied: false, reason: "pending" });
    } finally {
      process.env = saved;
    }
    assert.equal(store.rows[0]?.lastError, "not_configured");
  });
});

describe("grantWelcome", () => {
  it("pays 5,000 once per player", async () => {
    const d = deps([balances(5000)]);

    assert.deepEqual(await grantWelcome("u1", d), { applied: true, balance: 5000 });
    assert.deepEqual(await grantWelcome("u1", d), { applied: false, reason: "already_recorded" });
    assert.equal(d.requests.length, 1);
    assert.deepEqual(d.requests[0]?.body, { adjustments: { COIN: 5000 } });
  });
});

describe("retryPending", () => {
  it("re-sends a pending row under its own id and settles it", async () => {
    const d = deps([rcError(500, "server_error"), balances(5000)]);

    await grantWelcome("u1", d);
    const [row] = d.store.rows;
    assert.equal(row?.status, "pending");

    assert.equal(await retryPending("u1", d), 1);
    assert.equal(d.requests[1]?.headers["Idempotency-Key"], row?.id);
    assert.equal(d.requests[0]?.headers["Idempotency-Key"], row?.id);
    assert.equal(d.store.rows[0]?.status, "applied");
    assert.equal(d.store.rows[0]?.attempts, 2);
  });

  it("stops at the first row still unreachable, keeping the order", async () => {
    const d = deps(["network", "network", "network", balances(1)]);
    await applyWalletChange("u1", "adjustment", 1, {}, d);
    await applyWalletChange("u1", "adjustment", 2, {}, d);

    assert.equal(await retryPending("u1", d), 0);
    assert.equal(d.requests.length, 3, "the second row was not sent ahead of the first");
  });

  it("holds a table's cash-out until its buy-in has applied", async () => {
    const d = deps(["network", balances(4500), balances(5000)]);
    await applyWalletChange("u1", "buy_in", -500, { ref: "room:seat" }, d);

    assert.deepEqual(await applyWalletChange("u1", "cash_out", 500, { ref: "room:seat" }, d), { applied: false, reason: "pending" });
    assert.equal(d.requests.length, 1, "the cash-out was not sent ahead of its buy-in");

    assert.equal(await retryPending("u1", d), 2);
    assert.deepEqual(d.store.rows.map((row) => row.status), ["applied", "applied"]);
  });

  it("never pays back a buy-in that failed, in this pass or a later one", async () => {
    const d = deps(["network", rcError(422, "unprocessable_entity_error")]);
    await applyWalletChange("u1", "buy_in", -500, { ref: "room:seat" }, d);
    await applyWalletChange("u1", "cash_out", 500, { ref: "room:seat" }, d);

    assert.equal(await retryPending("u1", d), 0);
    assert.equal(d.requests.length, 2, "the cash-out was never sent");
    assert.deepEqual(d.store.rows.map((row) => [row.status, row.lastError]), [
      ["failed", "http_422_unprocessable_entity_error"],
      ["failed", "no_buy_in"],
    ]);
  });

  it("pays nothing for a table's cash-out with no buy-in behind it", async () => {
    const d = deps([]);

    assert.deepEqual(await applyWalletChange("u1", "cash_out", 500, { ref: "room:seat" }, d), { applied: false, reason: "rejected" });
    assert.equal(d.requests.length, 0);
  });

  it("sends nothing when nothing is pending", async () => {
    const d = deps([]);

    assert.equal(await retryPending("u1", d), 0);
  });
});
