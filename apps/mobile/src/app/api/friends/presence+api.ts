import { beat, goOffline, takeInvites } from "@wordpoker/db";
import { sessionUser } from "@/auth/server/session-user";

/** The app's heartbeat (STO-584): marks the account online and hands back the invites waiting for it. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to see friends." }, { status: 403 });
    const body: unknown = await request.json().catch(() => null);
    const atTable = typeof body === "object" && body !== null && "atTable" in body && body.atTable === true;
    await beat(user.id, atTable);
    return Response.json({ invites: await takeInvites(user.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Presence isn't available right now." }, { status: 503 });
  }
}

/** The app went to the background or the player signed out. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in first." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to see friends." }, { status: 403 });
    await goOffline(user.id);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Presence isn't available right now." }, { status: 503 });
  }
}
