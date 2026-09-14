import assert from "node:assert/strict";
import test from "node:test";

import { passwordResetEmail } from "./email.ts";

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
