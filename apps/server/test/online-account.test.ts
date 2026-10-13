import assert from "node:assert/strict";
import { onlineAccount } from "../src/auth/online-account.js";

describe("online account verification", () => {
  const originalFetch = globalThis.fetch;
  const originalOrigin = process.env.AUTH_API_URL;
  let requests: { url: string; init?: RequestInit }[];

  beforeEach(() => {
    process.env.AUTH_API_URL = "https://auth.example";
    requests = [];
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) delete process.env.AUTH_API_URL;
    else process.env.AUTH_API_URL = originalOrigin;
  });

  function response(body: unknown, status = 200) {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status });
    };
  }

  it("uses the configured auth service and returns only its verified account", async () => {
    response({ user: { id: "account-a" }, session: { expiresAt: new Date(Date.now() + 60000).toISOString() } });
    assert.deepEqual(await onlineAccount("session-token"), { userId: "account-a" });
    assert.equal(requests[0]?.url, "https://auth.example/api/auth/get-session?disableCookieCache=true");
    assert.deepEqual(requests[0]?.init?.headers, { authorization: "Bearer session-token" });
    assert.equal(requests[0]?.init?.redirect, "error");
  });

  it("rejects absent, malformed, revoked and expired credentials", async () => {
    for (const token of [undefined, "", "x".repeat(4097), "a\r\nb", { userId: "account-b" }]) {
      await assert.rejects(onlineAccount(token), (error: { code?: number }) => error.code === 401);
    }
    response(null);
    await assert.rejects(onlineAccount("revoked"), (error: { code?: number }) => error.code === 401);
    response({ user: { id: "account-a" }, session: { expiresAt: new Date(0).toISOString() } });
    await assert.rejects(onlineAccount("expired"), (error: { code?: number }) => error.code === 401);
    response({}, 401);
    await assert.rejects(onlineAccount("invalid"), (error: { code?: number }) => error.code === 401);
  });

  it("fails closed when the auth service is unavailable", async () => {
    globalThis.fetch = async () => { throw new Error("network down"); };
    await assert.rejects(onlineAccount("session-token"), (error: { code?: number }) => error.code === 503);
  });
});
