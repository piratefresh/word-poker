/**
 * The web coin store over a mocked `@revenuecat/purchases-js`: configure once on an anonymous id,
 * move to the player and back, read the Offering, and tell a closed checkout from a failure.
 */

const mockSdk = {
  changeUser: jest.fn(),
  getOfferings: jest.fn(),
  purchase: jest.fn(),
};

jest.mock("@revenuecat/purchases-js", () => {
  class PurchasesError extends Error {
    errorCode: number;

    constructor(errorCode: number) {
      super("purchase failed");
      this.errorCode = errorCode;
    }
  }

  return {
    ErrorCode: { UserCancelledError: 1 },
    PurchasesError,
    Purchases: {
      configure: jest.fn(() => mockSdk),
      generateRevenueCatAnonymousAppUserId: jest.fn(() => "$RCAnonymousID:abc"),
    },
  };
});

type Web = typeof import("./revenuecat.web");

function load(key: string | undefined): Web {
  if (key === undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY;
  else process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY = key;
  let web!: Web;
  jest.isolateModules(() => {
    web = require("./revenuecat.web");
  });

  return web;
}

const { Purchases, PurchasesError } = jest.requireMock("@revenuecat/purchases-js");

beforeEach(() => jest.clearAllMocks());
afterAll(() => delete process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY);

test("sells nothing without the Web Billing key", async () => {
  const web = load(undefined);

  expect(web.revenuecatAvailable()).toBe(false);
  await expect(web.fetchCoinOffering()).rejects.toBeInstanceOf(web.StoreUnavailableError);
  await expect(web.logOutRevenueCat()).resolves.toBeUndefined();
});

test("configures once, anonymously, then moves to the player and back", async () => {
  const web = load("rcb_test");

  expect(web.revenuecatAvailable()).toBe(true);
  await web.logInRevenueCat("user_1");
  await web.logOutRevenueCat();

  expect(Purchases.configure).toHaveBeenCalledTimes(1);
  expect(Purchases.configure).toHaveBeenCalledWith({ apiKey: "rcb_test", appUserId: "$RCAnonymousID:abc" });
  expect(mockSdk.changeUser.mock.calls).toEqual([["user_1"], ["$RCAnonymousID:abc"]]);
});

test("reads the current Offering's packages and their display metadata", async () => {
  const pkg = { webBillingProduct: { identifier: "coins_small", price: { formattedPrice: "$0.99", amountMicros: 990000 } } };
  mockSdk.getOfferings.mockResolvedValue({
    current: { availablePackages: [pkg], metadata: { packs: { coins_small: { label: "Pouch" } } } },
  });

  const offering = await load("rcb_test").fetchCoinOffering();

  expect(offering).toEqual({
    packages: [{ productId: "coins_small", priceString: "$0.99", price: 0.99, handle: pkg }],
    display: { coins_small: { label: "Pouch" } },
  });
});

test("a closed checkout is cancelled; any other failure throws", async () => {
  const web = load("rcb_test");
  const pack = { productId: "coins_small", priceString: "$0.99", price: 0.99, handle: {} };

  mockSdk.purchase.mockResolvedValueOnce({});
  await expect(web.purchaseCoinPack(pack)).resolves.toBe("purchased");
  expect(mockSdk.purchase).toHaveBeenCalledWith({ rcPackage: pack.handle });

  mockSdk.purchase.mockRejectedValueOnce(new PurchasesError(1));
  await expect(web.purchaseCoinPack(pack)).resolves.toBe("cancelled");

  mockSdk.purchase.mockRejectedValueOnce(new PurchasesError(2));
  await expect(web.purchaseCoinPack(pack)).rejects.toThrow("purchase failed");
});
