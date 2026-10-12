import { ServerError } from "colyseus";

export interface OnlineAccount {
  readonly userId: string;
}

/** Verify against the same Better Auth instance that owns the history API. */
export async function onlineAccount(token: unknown): Promise<OnlineAccount> {
  if (typeof token !== "string" || token.length === 0 || token.length > 4096 || /[\r\n]/.test(token)) {
    throw new ServerError(401, "Sign in to join an online table.");
  }
  const origin = process.env.AUTH_API_URL ?? (process.env.NODE_ENV !== "production" ? "http://localhost:8081" : undefined);
  if (!origin) throw new ServerError(503, "Online sign-in is not configured.");
  let url: URL;
  try {
    url = new URL("/api/auth/get-session", origin);
  } catch {
    throw new ServerError(503, "Online sign-in is not configured.");
  }
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
    throw new ServerError(503, "Online sign-in is not configured.");
  }
  // No caller-supplied origin, cookies, account id, or cache. Revoked sessions fail fresh joins.
  url.searchParams.set("disableCookieCache", "true");
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new ServerError(503, "Sign-in could not be verified. Try again.");
  }
  if (!response.ok) {
    throw new ServerError(response.status >= 500 ? 503 : 401, "Sign-in could not be verified. Try signing in again.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (typeof body !== "object" || body === null || !("user" in body) || !("session" in body) ||
      typeof body.user !== "object" || body.user === null || !("id" in body.user) ||
      typeof body.user.id !== "string" || body.user.id.length === 0 || body.user.id.length > 128 ||
      typeof body.session !== "object" || body.session === null || !("expiresAt" in body.session) ||
      typeof body.session.expiresAt !== "string" || !(Date.parse(body.session.expiresAt) > Date.now())) {
    throw new ServerError(401, "Sign in to join an online table.");
  }
  return { userId: body.user.id };
}
