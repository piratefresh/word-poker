import assert from "node:assert/strict";
import test from "node:test";

import { normalizePasswordResetRequest } from "./auth-request.ts";

test("repairs a reset callback whose entire query pair was encoded", () => {
  const request = new Request(
    "http://localhost:8081/api/auth/reset-password/test-token" +
      "?callbackURL%3Dwordpoker%253A%252F%252Freset-password" +
      "&source=gmail",
  );

  const normalized = normalizePasswordResetRequest(request);
  const url = new URL(normalized.url);

  assert.equal(url.searchParams.get("callbackURL"), "wordpoker://reset-password");
  assert.equal(url.searchParams.get("source"), "gmail");
  assert.equal(
    [...url.searchParams.keys()].some((key) => key.startsWith("callbackURL=")),
    false,
  );
});

test("leaves a correctly encoded reset callback unchanged", () => {
  const request = new Request(
    "http://localhost:8081/api/auth/reset-password/test-token" +
      "?callbackURL=wordpoker%3A%2F%2Freset-password",
  );

  assert.equal(normalizePasswordResetRequest(request), request);
});

test("does not normalize other auth routes", () => {
  const request = new Request(
    "http://localhost:8081/api/auth/callback/test-provider" +
      "?callbackURL%3Dwordpoker%253A%252F%252Freset-password",
  );

  assert.equal(normalizePasswordResetRequest(request), request);
});

test("does not normalize non-GET requests", () => {
  const request = new Request(
    "http://localhost:8081/api/auth/reset-password/test-token" +
      "?callbackURL%3Dwordpoker%253A%252F%252Freset-password",
    { method: "POST" },
  );

  assert.equal(normalizePasswordResetRequest(request), request);
});
