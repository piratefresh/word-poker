/**
 * The app's Wallet reads: the session travels as a cookie header on native, the server's refusals
 * become typed failures, and a body the contracts cannot read is a failure rather than a number.
 */

import { authClient } from "@/auth/client/auth-client";
import {
  fetchCoinCatalog,
  fetchQuestState,
  fetchWallet,
  sendQuestHandClaim,
  WalletAuthError,
  WalletUnverifiedError,
} from "@/lib/wallet-client";

jest.mock("@/lib/api-base-url", () => ({ apiBaseURL: "http://api.test" }));
jest.mock("@/auth/client/auth-client", () => ({ authClient: { getCookie: jest.fn(() => "better-auth.session=abc") } }));

const fetchMock = jest.fn();

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("fetchWallet", () => {
  test("sends the stored session cookie and reads the coins", async () => {
    fetchMock.mockResolvedValue(reply(200, { coins: 5000, welcomed: true }));

    await expect(fetchWallet()).resolves.toEqual({ coins: 5000, welcomed: true });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/wallet", {
      credentials: "omit",
      headers: { cookie: "better-auth.session=abc" },
    });
  });

  test("sends no cookie header when there is no session", async () => {
    jest.mocked(authClient.getCookie).mockReturnValueOnce("");
    fetchMock.mockResolvedValue(reply(401, { error: "Sign in to see your coins." }));

    await expect(fetchWallet()).rejects.toBeInstanceOf(WalletAuthError);
    expect(fetchMock.mock.calls[0][1]).toEqual({ credentials: "omit", headers: {} });
  });

  test("surfaces the server's sentence on a failure", async () => {
    fetchMock.mockResolvedValue(reply(502, { error: "The coin store could not be reached." }));

    await expect(fetchWallet()).rejects.toThrow("The coin store could not be reached.");
  });

  test("refuses a balance it cannot read", async () => {
    fetchMock.mockResolvedValue(reply(200, { coins: "lots" }));

    await expect(fetchWallet()).rejects.toThrow("could not read");
  });
});

describe("fetchCoinCatalog", () => {
  test("reads the catalog", async () => {
    const catalog = { packs: [{ productId: "coins_small", coins: 2000 }] };
    fetchMock.mockResolvedValue(reply(200, catalog));

    await expect(fetchCoinCatalog()).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/store-catalog");
  });

  test("refuses a catalog it cannot read", async () => {
    fetchMock.mockResolvedValue(reply(200, { packs: [{ productId: "coins_small" }] }));

    await expect(fetchCoinCatalog()).rejects.toThrow("could not read");
  });
});

describe("fetchQuestState", () => {
  test("reads the streak and quest progress", async () => {
    const state = { streak: { current: 1, creditedToday: 50 }, quests: [{ id: "pot-500", progress: 1, done: true }] };
    fetchMock.mockResolvedValue(reply(200, state));

    await expect(fetchQuestState()).resolves.toEqual(state);
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/quests", {
      credentials: "omit",
      headers: { cookie: "better-auth.session=abc" },
    });
  });

  test("rejects with WalletAuthError on a 401", async () => {
    fetchMock.mockResolvedValue(reply(401, { error: "Sign in to see your quests." }));

    await expect(fetchQuestState()).rejects.toBeInstanceOf(WalletAuthError);
  });

  test("rejects with WalletUnverifiedError on a 403", async () => {
    fetchMock.mockResolvedValue(reply(403, { error: "Verify your email to earn coins." }));

    const error = await fetchQuestState().catch((caught) => caught);
    expect(error).toBeInstanceOf(WalletUnverifiedError);
    expect(error.message).toBe("Verify your email to earn coins.");
  });
});

describe("sendQuestHandClaim", () => {
  const CLAIM = {
    handToken: "token-1",
    facts: {
      revealed: true,
      heroWon: true,
      heroWord: "CAT",
      heroScore: 12,
      heroDecidedBy: "final-score" as const,
      pot: 300,
      wildTable: false,
      heroUsedPower: false,
    },
  };

  test("posts the claim and reads what it completed", async () => {
    fetchMock.mockResolvedValue(reply(200, { completed: ["win-word-3"], duplicate: false }));

    await expect(sendQuestHandClaim(CLAIM)).resolves.toEqual({ completed: ["win-word-3"], duplicate: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/quests");
    expect(init).toMatchObject({ method: "POST", body: JSON.stringify(CLAIM) });
  });

  test("rejects with WalletAuthError on a 401", async () => {
    fetchMock.mockResolvedValue(reply(401, { error: "Sign in to earn coins." }));

    await expect(sendQuestHandClaim(CLAIM)).rejects.toBeInstanceOf(WalletAuthError);
  });
});
