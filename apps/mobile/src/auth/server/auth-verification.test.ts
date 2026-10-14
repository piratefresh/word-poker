/**
 * The verification callbacks Better Auth runs: the mail goes out with its link, and verifying pays
 * the welcome grant without ever failing the verification itself.
 */

import { countPlayedHands, recordReferral } from "@wordpoker/db";
import { grantWelcome, payReferral } from "@wordpoker/economy";

import { afterEmailVerification, attributeReferral, grantEligibleRewards, sendVerificationEmail } from "./auth-verification";
import { sendEmail } from "./email";

jest.mock("@wordpoker/db", () => ({ countPlayedHands: jest.fn(async () => 0), recordReferral: jest.fn(async () => true) }));
jest.mock("@wordpoker/economy", () => ({ grantWelcome: jest.fn(), payReferral: jest.fn(async () => {}) }));
jest.mock("./email", () => ({
  ...jest.requireActual("./email"),
  sendEmail: jest.fn(async () => {}),
}));

const grant = jest.mocked(grantWelcome);
const send = jest.mocked(sendEmail);
const USER = { id: "user_1", email: "ada@example.com", name: "Ada" };

beforeEach(() => {
  grant.mockReset();
  send.mockReset();
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("afterEmailVerification", () => {
  test("pays the welcome grant to the verified user", async () => {
    grant.mockResolvedValue({ applied: true, balance: 5000 });

    await afterEmailVerification(USER);

    expect(grant).toHaveBeenCalledWith("user_1", {}, 0);
  });

  test("adds a bonus for the hands played as a guest, capped", async () => {
    grant.mockResolvedValue({ applied: true, balance: 5300 });
    jest.mocked(countPlayedHands).mockResolvedValueOnce(3);
    await afterEmailVerification(USER);
    expect(grant).toHaveBeenLastCalledWith("user_1", {}, 300);

    jest.mocked(countPlayedHands).mockResolvedValueOnce(50);
    await afterEmailVerification(USER);
    expect(grant).toHaveBeenLastCalledWith("user_1", {}, 1000);
  });

  test("records nothing when the hand count fails, so the wallet read retries the full grant", async () => {
    grant.mockResolvedValue({ applied: true, balance: 5000 });
    jest.mocked(countPlayedHands).mockRejectedValueOnce(new Error("database down"));

    await afterEmailVerification(USER);

    expect(grant).not.toHaveBeenCalled();
  });

  test("pays eligible Game Center accounts and nobody ineligible", async () => {
    grant.mockResolvedValue({ applied: true, balance: 5000 });

    await grantEligibleRewards({ id: "gc", emailVerified: false, primaryIdentityVerified: true });
    await grantEligibleRewards({ id: "unverified", emailVerified: false, primaryIdentityVerified: false });
    await grantEligibleRewards({ id: "guest", isAnonymous: true, primaryIdentityVerified: true });

    expect(grant.mock.calls.map(([id]) => id)).toEqual(["gc"]);
  });

  test("never throws when the grant fails", async () => {
    grant.mockRejectedValue(new Error("database down"));

    await expect(afterEmailVerification(USER)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  test("says so when the grant is left pending", async () => {
    grant.mockResolvedValue({ applied: false, reason: "pending" });

    await expect(afterEmailVerification(USER)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("sendVerificationEmail", () => {
  test("mails the link with the welcome coins", async () => {
    const url = "http://localhost:8081/api/auth/verify-email?token=t";

    await sendVerificationEmail({ user: USER, url });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ada@example.com",
        subject: "Confirm your email to claim your 5,000 welcome coins",
        text: expect.stringContaining(url),
      }),
    );
  });

  test("logs a mail that will not send instead of failing the sign-up", async () => {
    send.mockRejectedValue(new Error("Missing environment variable: RESEND_API_KEY"));

    await expect(sendVerificationEmail({ user: USER, url: "http://x" })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("referrals", () => {
  const withRef = (code: string) => new Headers({ "x-wordpoker-ref": code });

  test("verifying pays the referral after the welcome grant, and survives its failure", async () => {
    grant.mockResolvedValue({ applied: true, balance: 5000 });
    jest.mocked(payReferral).mockRejectedValueOnce(new Error("down"));
    await expect(afterEmailVerification(USER)).resolves.toBeUndefined();
    expect(payReferral).toHaveBeenCalledWith("user_1");
  });

  test("a sign-up carrying a friend code is attributed; a guest, a bad code or no header is not", async () => {
    jest.mocked(recordReferral).mockClear();
    await attributeReferral({ id: "new" }, withRef("ABCD2345"));
    expect(recordReferral).toHaveBeenCalledWith("new", "ABCD2345");

    jest.mocked(recordReferral).mockClear();
    await attributeReferral({ id: "g", isAnonymous: true }, withRef("ABCD2345"));
    await attributeReferral({ id: "new" }, withRef("ABCI2345"));
    await attributeReferral({ id: "new" }, new Headers());
    await attributeReferral({ id: "new" }, undefined);
    expect(recordReferral).not.toHaveBeenCalled();
  });

  test("never throws when recording fails", async () => {
    jest.mocked(recordReferral).mockRejectedValueOnce(new Error("down"));
    await expect(attributeReferral({ id: "new" }, withRef("ABCD2345"))).resolves.toBeUndefined();
  });
});
