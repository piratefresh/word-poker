import { deletePushToken, savePushToken } from "@wordpoker/db";
import { sessionUser } from "@/auth/server/session-user";

const TOKEN_PATTERN = /^Expo(nent)?PushToken\[.+\]$/;

async function tokenFrom(request: Request): Promise<string | null> {
  const body: unknown = await request.json().catch(() => null);
  const token = typeof body === "object" && body !== null && "token" in body ? body.token : null;
  return typeof token === "string" && token.length <= 256 && TOKEN_PATTERN.test(token) ? token : null;
}

/** Registers this device for pushes (STO-585); a token that was another account's moves to this one. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up for notifications." }, { status: 403 });
    const token = await tokenFrom(request);
    if (!token) return Response.json({ error: "That push token couldn't be read." }, { status: 400 });
    await savePushToken(user.id, token);
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: "Notifications aren't available right now." }, { status: 503 });
  }
}

/** Sign-out: this device stops receiving this account's pushes. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    const token = await tokenFrom(request);
    if (!token) return Response.json({ error: "That push token couldn't be read." }, { status: 400 });
    await deletePushToken(user.id, token);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Notifications aren't available right now." }, { status: 503 });
  }
}
