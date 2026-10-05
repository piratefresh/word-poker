/**
 * The Wallet's three routes: the balance (behind the session), the catalog, and RevenueCat's
 * webhook (behind its Authorization header). `@wordpoker/economy` and `@wordpoker/db` are the
 * seams; their own suites judge RevenueCat's shapes and the table.
 */

import { recordReportedEvent } from "@wordpoker/db";
import { coinCatalog, getCoinBalance, retryPending } from "@wordpoker/economy";

import { POST as webhook } from "@/app/api/revenuecat-webhook+api";
import { GET as catalog } from "@/app/api/store-catalog+api";
import { GET as wallet } from "@/app/api/wallet+api";
import { auth } from "@/auth/server/auth";

jest.mock("@/auth/server/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
jest.mock("@wordpoker/db", () => ({ recordReportedEvent: jest.fn() }));
jest.mock("@wordpoker/economy", () => ({
  parseCurrencyEvent: jest.requireActual("@wordpoker/economy").parseCurrencyEvent,
  coinCatalog: jest.fn(),
  getCoinBalance: jest.fn(),
  retryPending: jest.fn(),
}));

const getSession = jest.mocked(auth.api.getSession) as unknown as jest.Mock;
const balance = jest.mocked(getCoinBalance);
const retry = jest.mocked(retryPending);
const readCatalog = jest.mocked(coinCatalog);
const record = jest.mocked(recordReportedEvent);

const SECRET = "Bearer whsec_test";

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
  process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
});

afterEach(() => {
  jest.restoreAllMocks();
  delete process.env.REVENUECAT_WEBHOOK_AUTH;
});

const walletRequest = () => new Request("http://localhost:8081/api/wallet", { headers: { cookie: "session=1" } });

describe("GET /api/wallet", () => {
  test("refuses without a session", async () => {
    getSession.mockResolvedValue(null);

    const response = await wallet(walletRequest());

    expect(response.status).toBe(401);
    expect(balance).not.toHaveBeenCalled();
  });

  test("retries pending changes, then reads the balance", async () => {
    getSession.mockResolvedValue({ user: { id: "user_1" }, session: {} });
    const order: string[] = [];
    retry.mockImplementation(async () => {
      order.push("retry");
      return 1;
    });
    balance.mockImplementation(async () => {
      order.push("balance");
      return 5000;
    });

    const response = await wallet(walletRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ coins: 5000 });
    expect(order).toEqual(["retry", "balance"]);
    expect(retry).toHaveBeenCalledWith("user_1");
  });

  test("still reads the balance when the retry throws", async () => {
    getSession.mockResolvedValue({ user: { id: "user_1" }, session: {} });
    retry.mockRejectedValue(new Error("db down"));
    balance.mockResolvedValue(10);

    const response = await wallet(walletRequest());

    expect(response.status).toBe(200);
  });

  test("answers 502 without the exception's text when RevenueCat cannot be read", async () => {
    getSession.mockResolvedValue({ user: { id: "user_1" }, session: {} });
    retry.mockResolvedValue(0);
    balance.mockRejectedValue(new Error("sk_secret leaked?"));

    const response = await wallet(walletRequest());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "The coin store could not be reached." });
  });
});

describe("GET /api/store-catalog", () => {
  test("answers the catalog", async () => {
    readCatalog.mockResolvedValue({ packs: [{ productId: "coins_small", coins: 2000 }] });

    const response = await catalog();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ packs: [{ productId: "coins_small", coins: 2000 }] });
  });

  test("answers 502 when RevenueCat cannot be read", async () => {
    readCatalog.mockRejectedValue(new Error("down"));

    expect((await catalog()).status).toBe(502);
  });
});

const PURCHASE = {
  api_version: "1.0",
  event: {
    type: "VIRTUAL_CURRENCY_TRANSACTION",
    id: "evt-1",
    app_user_id: "user_1",
    adjustments: [{ amount: 2000, currency: { code: "COIN" } }],
    source: "in_app_purchase",
    product_id: "coins_small",
    virtual_currency_transaction_id: "vatx1",
  },
};

function hook(body: unknown, authorization: string | null = SECRET): Promise<Response> {
  return webhook(
    new Request("http://localhost:8081/api/revenuecat-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

describe("POST /api/revenuecat-webhook", () => {
  test("answers 503 when no secret is configured", async () => {
    delete process.env.REVENUECAT_WEBHOOK_AUTH;

    expect((await hook(PURCHASE)).status).toBe(503);
  });

  test("refuses a missing or wrong Authorization header", async () => {
    expect((await hook(PURCHASE, null)).status).toBe(401);
    expect((await hook(PURCHASE, "Bearer nope")).status).toBe(401);
    expect(record).not.toHaveBeenCalled();
  });

  test("refuses a body that is not a webhook", async () => {
    expect((await hook("not json")).status).toBe(400);
    expect((await hook({ hello: "world" })).status).toBe(400);
  });

  test("records a purchase", async () => {
    record.mockResolvedValue(true);

    const response = await hook(PURCHASE);

    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledWith({
      userId: "user_1",
      kind: "purchase",
      amount: 2000,
      productId: "coins_small",
      rcEventId: "evt-1",
      rcTransactionId: "vatx1",
    });
  });

  test("answers 200 to a redelivered event the store already holds", async () => {
    record.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await hook(PURCHASE);
    const again = await hook(PURCHASE);

    expect(again.status).toBe(200);
    await expect(again.json()).resolves.toEqual({ received: true, recorded: false });
  });

  test("answers 200 to an unrelated event without recording", async () => {
    const response = await hook({ api_version: "1.0", event: { type: "INITIAL_PURCHASE", id: "e2" } });

    expect(response.status).toBe(200);
    expect(record).not.toHaveBeenCalled();
  });

  test("answers 500 when the store fails, so RevenueCat retries", async () => {
    record.mockRejectedValue(new Error("db down"));

    expect((await hook(PURCHASE)).status).toBe(500);
  });
});
