/**
 * Reading RevenueCat's webhook body: purchases, refunds, other events and garbage.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseCurrencyEvent } from "../src/index";

function currencyEvent(overrides: Record<string, unknown> = {}) {
  return {
    api_version: "1.0",
    event: {
      type: "VIRTUAL_CURRENCY_TRANSACTION",
      id: "12345678-1234-1234-1234-123456789012",
      app_user_id: "user_1",
      adjustments: [{ amount: 2000, currency: { code: "COIN", name: "Coins", description: "" } }],
      source: "in_app_purchase",
      product_id: "coins_small",
      virtual_currency_transaction_id: "vatx1",
      store: "APP_STORE",
      ...overrides,
    },
  };
}

describe("parseCurrencyEvent", () => {
  it("reads a purchase", () => {
    assert.deepEqual(parseCurrencyEvent(currencyEvent()), {
      type: "VIRTUAL_CURRENCY_TRANSACTION",
      record: {
        userId: "user_1",
        kind: "purchase",
        amount: 2000,
        productId: "coins_small",
        rcEventId: "12345678-1234-1234-1234-123456789012",
        rcTransactionId: "vatx1",
      },
    });
  });

  it("reads a negative in-app adjustment as a refund, and a dashboard one as an adjustment", () => {
    const refund = parseCurrencyEvent(
      currencyEvent({ adjustments: [{ amount: -2000, currency: { code: "COIN" } }] }),
    );
    assert.equal(refund?.record?.kind, "refund");
    assert.equal(refund?.record?.amount, -2000);

    const dashboard = parseCurrencyEvent(currencyEvent({ source: "dashboard", product_id: undefined }));
    assert.equal(dashboard?.record?.kind, "adjustment");
    assert.equal(dashboard?.record?.productId, null);
  });

  it("records nothing for a change our own server sent", () => {
    assert.deepEqual(parseCurrencyEvent(currencyEvent({ source: "admin_api", product_id: undefined })), {
      type: "VIRTUAL_CURRENCY_TRANSACTION",
      record: null,
    });
  });

  it("ignores other currencies and records nothing when COIN did not move", () => {
    const parsed = parseCurrencyEvent(
      currencyEvent({ adjustments: [{ amount: 50, currency: { code: "GEM" } }] }),
    );
    assert.deepEqual(parsed, { type: "VIRTUAL_CURRENCY_TRANSACTION", record: null });

    const mixed = parseCurrencyEvent(
      currencyEvent({
        adjustments: [
          { amount: 50, currency: { code: "GEM" } },
          { amount: 1000, currency: { code: "COIN" } },
        ],
      }),
    );
    assert.equal(mixed?.record?.amount, 1000);
  });

  it("reads another event type without a record", () => {
    assert.deepEqual(parseCurrencyEvent({ api_version: "1.0", event: { type: "INITIAL_PURCHASE", id: "e" } }), {
      type: "INITIAL_PURCHASE",
      record: null,
    });
  });

  it("refuses a body that is not a webhook", () => {
    for (const body of [null, "x", {}, { event: null }, { event: { id: "e" } }, currencyEvent({ id: undefined }), currencyEvent({ app_user_id: "" })]) {
      assert.equal(parseCurrencyEvent(body), null, JSON.stringify(body));
    }
  });
});
