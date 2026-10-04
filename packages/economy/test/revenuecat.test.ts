/**
 * The v2 client's request shapes and its reading of RevenueCat's answers, against a stubbed fetch.
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  EconomyNotConfiguredError,
  InsufficientCoinsError,
  RevenueCatError,
  createRevenueCatClient,
  revenueCat,
} from "../src/index";
import { balances, fakeFetch, rcError, type Reply } from "./fake-fetch";

const BASE = "https://api.revenuecat.com/v2/projects/proj1";

function client(replies: Reply[]) {
  const fake = fakeFetch(replies);
  const sleeps: number[] = [];
  const rc = createRevenueCatClient({
    projectId: "proj1",
    secretKey: "sk_test",
    fetch: fake.fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  return { rc, requests: fake.requests, sleeps };
}

describe("getCoinBalance", () => {
  it("reads the COIN balance with the secret key", async () => {
    const { rc, requests } = client([balances(1200)]);

    assert.equal(await rc.getCoinBalance("user_1"), 1200);
    assert.equal(requests[0]?.url, `${BASE}/customers/user_1/virtual_currencies`);
    assert.equal(requests[0]?.method, "GET");
    assert.equal(requests[0]?.headers.Authorization, "Bearer sk_test");
  });

  it("reads an absent COIN, or a customer RevenueCat has never seen, as 0", async () => {
    const { rc } = client([balances(null), rcError(404, "resource_missing")]);

    assert.equal(await rc.getCoinBalance("user_1"), 0);
    assert.equal(await rc.getCoinBalance("user_2"), 0);
  });

  it("throws the status, not the body, on a failure", async () => {
    const { rc } = client([rcError(500, "server_error")]);

    await assert.rejects(rc.getCoinBalance("user_1"), (error: unknown) => {
      assert.ok(error instanceof RevenueCatError);
      assert.equal(error.status, 500);
      assert.equal(error.type, "server_error");
      assert.ok(!error.message.includes("…"));
      return true;
    });
  });

  it("reports an unreachable RevenueCat as status 0", async () => {
    const { rc } = client(["network"]);

    await assert.rejects(rc.getCoinBalance("user_1"), (error: unknown) => {
      assert.ok(error instanceof RevenueCatError);
      assert.equal(error.status, 0);
      return true;
    });
  });
});

describe("adjustCoins", () => {
  it("posts the adjustment with the idempotency key and returns the new balance", async () => {
    const { rc, requests } = client([balances(5000)]);

    assert.equal(await rc.adjustCoins("user_1", 5000, "evt-1"), 5000);
    assert.deepEqual(requests[0], {
      url: `${BASE}/customers/user_1/virtual_currencies/transactions`,
      method: "POST",
      headers: {
        Authorization: "Bearer sk_test",
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": "evt-1",
      },
      body: { adjustments: { COIN: 5000 } },
    });
  });

  it("reads a spend down to zero as 0 (RevenueCat drops empty balances)", async () => {
    const { rc } = client([balances(null)]);

    assert.equal(await rc.adjustCoins("user_1", -500, "evt-2"), 0);
  });

  it("turns a 422 into InsufficientCoinsError", async () => {
    const { rc } = client([rcError(422, "unprocessable_entity_error")]);

    await assert.rejects(rc.adjustCoins("user_1", -999_999, "evt-3"), InsufficientCoinsError);
  });

  it("waits out one 429's Retry-After, then gives up on the second", async () => {
    const limited = { ...rcError(429, "rate_limit_error"), headers: { "Retry-After": "2" } };
    const ok = client([limited, balances(10)]);

    assert.equal(await ok.rc.adjustCoins("user_1", 10, "evt-4"), 10);
    assert.deepEqual(ok.sleeps, [2000]);
    assert.equal(ok.requests[1]?.headers["Idempotency-Key"], "evt-4");

    const twice = client([limited, limited]);
    await assert.rejects(twice.rc.adjustCoins("user_1", 10, "evt-5"), (error: unknown) => {
      assert.ok(error instanceof RevenueCatError);
      assert.equal(error.status, 429);
      return true;
    });
  });

  it("creates a customer RevenueCat answers 404 for, then resends under the same key", async () => {
    const { rc, requests } = client([rcError(404, "resource_missing"), { status: 201, body: { id: "user_9" } }, balances(5000)]);

    assert.equal(await rc.adjustCoins("user_9", 5000, "evt-6"), 5000);
    assert.equal(requests[1]?.url, `${BASE}/customers`);
    assert.deepEqual(requests[1]?.body, { id: "user_9" });
    assert.equal(requests[2]?.headers["Idempotency-Key"], "evt-6");
  });

  it("carries on when the customer was created by a racing request", async () => {
    const { rc } = client([rcError(404, "resource_missing"), rcError(409, "resource_already_exists"), balances(1)]);

    assert.equal(await rc.adjustCoins("user_9", 1, "evt-7"), 1);
  });
});

describe("listCoinGrants", () => {
  it("joins the currency's grants with the products' store identifiers, across pages", async () => {
    const { rc, requests } = client([
      {
        status: 200,
        body: {
          object: "virtual_currency",
          code: "COIN",
          product_grants: [
            { product_ids: ["prod_s_ios", "prod_s_play"], amount: 2000, trial_amount: 0, expire_at_cycle_end: false },
            { product_ids: ["prod_l_ios"], amount: 30000, trial_amount: 0, expire_at_cycle_end: false },
          ],
        },
      },
      {
        status: 200,
        body: {
          object: "list",
          items: [
            { id: "prod_s_ios", store_identifier: "coins_small", state: "active" },
            { id: "prod_s_play", store_identifier: "coins_small", state: "active" },
          ],
          next_page: "/v2/projects/proj1/products?starting_after=prod_s_play",
        },
      },
      {
        status: 200,
        body: { object: "list", items: [{ id: "prod_l_ios", store_identifier: "coins_large", state: "active" }], next_page: null },
      },
    ]);

    assert.deepEqual(await rc.listCoinGrants(), [
      { storeProductId: "coins_small", coins: 2000 },
      { storeProductId: "coins_large", coins: 30000 },
    ]);
    assert.equal(requests[0]?.url, `${BASE}/virtual_currencies/COIN`);
    assert.equal(requests[1]?.url, `${BASE}/products?limit=100`);
    assert.equal(requests[2]?.url, `${BASE}/products?starting_after=prod_s_play`);
  });

  it("skips archived products and lists nothing when the currency grants nothing", async () => {
    const archived = client([
      { status: 200, body: { code: "COIN", product_grants: [{ product_ids: ["p1"], amount: 5 }] } },
      { status: 200, body: { items: [{ id: "p1", store_identifier: "coins_small", state: "inactive" }], next_page: null } },
    ]);
    assert.deepEqual(await archived.rc.listCoinGrants(), []);

    const none = client([{ status: 200, body: { code: "COIN", product_grants: null } }]);
    assert.deepEqual(await none.rc.listCoinGrants(), []);
    assert.equal(none.requests.length, 1);
  });
});

describe("revenueCat()", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("refuses to build without its env", () => {
    delete process.env.REVENUECAT_PROJECT_ID;
    delete process.env.REVENUECAT_SECRET_API_KEY;

    assert.throws(() => revenueCat(), EconomyNotConfiguredError);
  });
});
