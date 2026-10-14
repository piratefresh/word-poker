import { auth } from "./auth";

/** Scope every query and write to the session account, never to a body/query user id. */
export async function sessionUser(request: Request): Promise<{ id: string; anonymous: boolean } | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  return session && session.session.expiresAt.getTime() > Date.now()
    ? { id: session.user.id, anonymous: session.user.isAnonymous === true }
    : null;
}
