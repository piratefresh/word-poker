import { auth } from "./auth";

/** History routes scope every query and write to this account, never to a body/query user id. */
export async function historyUser(request: Request): Promise<string | null> {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  return session && session.session.expiresAt.getTime() > Date.now() ? session.user.id : null;
}
