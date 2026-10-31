import assert from "node:assert/strict";
import test from "node:test";

import { revokeAppleToken } from "./apple-revoke.ts";

test("revokes the refresh token with the app's own credentials", async () => {
  process.env.APPLE_CLIENT_ID = "app.client";
  process.env.APPLE_CLIENT_SECRET = "jwt";
  let sent;
  await revokeAppleToken("refresh", async (url, init) => {
    sent = { url, form: Object.fromEntries(init.body) };
    return new Response(null, { status: 200 });
  });

  assert.equal(sent.url, "https://appleid.apple.com/auth/revoke");
  assert.deepEqual(sent.form, { client_id: "app.client", client_secret: "jwt", token: "refresh", token_type_hint: "refresh_token" });
});

test("never fails the deletion when Apple does", async () => {
  await revokeAppleToken("refresh", async () => new Response(null, { status: 400 }));
  await revokeAppleToken("refresh", async () => { throw new TypeError("offline"); });
});
