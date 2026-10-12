import assert from "node:assert/strict";
import { test } from "node:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { bearer } from "better-auth/plugins";

test("cookie and bearer credentials resolve the same account and revoked/expired sessions fail", async () => {
  const database = { user: [], session: [], account: [], verification: [] };
  const auth = betterAuth({
    baseURL: "http://auth.test",
    secret: "in-memory-test-secret-with-at-least-32-characters",
    database: memoryAdapter(database),
    emailAndPassword: { enabled: true },
    plugins: [bearer()],
  });
  const response = await auth.api.signUpEmail({
    body: { name: "Account A", email: "a@example.test", password: "fixture-password" },
    asResponse: true,
  });
  assert.equal(response.status, 200);
  const { token, user } = await response.json();
  const cookie = response.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
  const bearerHeaders = new Headers({ authorization: `Bearer ${token}` });
  const read = (headers) => auth.api.getSession({ headers, query: { disableCookieCache: true } });
  assert.equal((await read(new Headers({ cookie }))).user.id, user.id);
  assert.equal((await read(bearerHeaders)).user.id, user.id);
  assert.equal(await read(new Headers({ authorization: "Bearer forged-token" })), null);
  assert.equal(await read(new Headers()), null);
  database.session[0].expiresAt = new Date(0);
  assert.equal(await read(bearerHeaders), null);
  const signIn = await auth.api.signInEmail({ body: { email: "a@example.test", password: "fixture-password" } });
  const refreshedHeaders = new Headers({ authorization: `Bearer ${signIn.token}` });
  assert.equal((await read(refreshedHeaders)).user.id, user.id);
  await auth.api.signOut({ headers: refreshedHeaders });
  assert.equal(await read(refreshedHeaders), null);
});
