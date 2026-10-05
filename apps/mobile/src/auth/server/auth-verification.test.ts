/**
 * The verification callbacks Better Auth runs: the mail goes out with its link, and verifying pays
 * the welcome grant without ever failing the verification itself.
 */

import { grantWelcome } from "@wordpoker/economy";

import { afterEmailVerification, sendVerificationEmail } from "./auth-verification";
import { sendEmail } from "./email";

jest.mock("@wordpoker/economy", () => ({ grantWelcome: jest.fn() }));
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

    expect(grant).toHaveBeenCalledWith("user_1");
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
