import assert from "node:assert/strict";
import test from "node:test";

import { passwordResetEmail, verifyEmailEmail } from "./email.ts";

test("uses the app deep link for the primary reset action", () => {
  const browserUrl =
    "http://localhost:8081/api/auth/reset-password/test-token" +
    "?callbackURL=wordpoker%3A%2F%2Freset-password";
  const deepLink = "wordpoker://reset-password?token=test-token";

  const email = passwordResetEmail({
    name: "Player",
    buttonUrl: browserUrl,
    deepLink,
  });

  assert.match(
    email.html,
    /href="wordpoker:\/\/reset-password\?token=test-token"[^>]*>Choose a new password<\/a>/,
  );
  assert.match(
    email.html,
    new RegExp(`href="${browserUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
  );
});

test("verification mail carries its link and the welcome coins", () => {
  const url = "http://localhost:8081/api/auth/verify-email?token=t&callbackURL=%2F";
  const email = verifyEmailEmail({ name: "Ada", buttonUrl: url, coins: "5,000" });

  assert.equal(email.subject, "Confirm your email to claim your 5,000 welcome coins");
  assert.match(email.html, /href="http:\/\/localhost:8081\/api\/auth\/verify-email\?token=t&amp;callbackURL=%2F"[^>]*>Confirm my email<\/a>/);
  assert.ok(email.text.includes(url));
  assert.ok(email.html.includes("Hi Ada"));
});
