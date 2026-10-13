import type { Client } from "@colyseus/sdk";

/** A seeded test identity (scripts/seed-test-user.mjs); never log its credentials/token. */
export async function authenticateSmokeClient(
  client: Client,
  email = process.env.TEST_USER_EMAIL ?? "e2e@wordpoker.dev",
): Promise<void> {
  const origin = process.env.AUTH_API_URL ?? "http://localhost:8081";
  const response = await fetch(new URL("/api/auth/sign-in/email", origin), {
    method: "POST",
    headers: { "content-type": "application/json", origin: new URL(origin).origin },
    body: JSON.stringify({
      email,
      password: process.env.TEST_USER_PASSWORD ?? "wordpoker-e2e",
    }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof body !== "object" || body === null || !("token" in body) || typeof body.token !== "string") {
    throw new Error(`Smoke sign-in failed for ${email}. Seed the E2E users and check AUTH_API_URL / TEST_USER_*.`);
  }
  client.auth.token = body.token;
}
