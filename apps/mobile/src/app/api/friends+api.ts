import { isFriendCode, FRIEND_REQUEST_MESSAGES } from "@wordpoker/contracts";
import { friendCode, friendList, requestFriend, userForFriendCode } from "@wordpoker/db";
import { sessionUser } from "@/auth/server/session-user";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in to add friends." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to add friends." }, { status: 403 });
    const [code, lists] = await Promise.all([friendCode(user.id), friendList(user.id)]);
    return Response.json({ code, ...lists }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Friends aren't available right now. Try again." }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in to add friends." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to add friends." }, { status: 403 });
    const body: unknown = await request.json().catch(() => null);
    const code = body && typeof body === "object" && "code" in body ? body.code : null;
    if (!isFriendCode(code)) return Response.json({ error: "That friend code couldn't be read." }, { status: 400 });
    const other = await userForFriendCode(code);
    const result = other === null ? "not-found" : await requestFriend(user.id, other);
    const status = result === "requested" ? 201 : result === "accepted" ? 200 :
      result === "self" ? 400 : result === "guest" || result === "not-found" ? 404 : 409;
    const message = FRIEND_REQUEST_MESSAGES[result === "guest" ? "not-found" : result];
    return Response.json(status < 300 ? { result, message } : { error: message }, { status });
  } catch {
    return Response.json({ error: "Friends aren't available right now. Try again." }, { status: 503 });
  }
}
