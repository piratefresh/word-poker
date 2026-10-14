import { ROOM_ID_PATTERN } from "@wordpoker/contracts";
import { acceptFriend, inviteToTable, isOnline, notifyUsers, removeFriend } from "@wordpoker/db";
import { sessionUser } from "@/auth/server/session-user";

async function change(request: Request, userId: string, accept: boolean): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in to add friends." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to add friends." }, { status: 403 });
    if (!userId || userId.length > 256) return Response.json({ error: "That player couldn't be found." }, { status: 400 });
    const changed = await (accept ? acceptFriend : removeFriend)(user.id, userId);
    return changed ? Response.json({ ok: true }) : Response.json({ error: "That request or friend couldn't be found." }, { status: 404 });
  } catch {
    return Response.json({ error: "Friends aren't available right now. Try again." }, { status: 503 });
  }
}

export function PUT(request: Request, { userId }: { userId: string }): Promise<Response> {
  return change(request, userId, true);
}

export function DELETE(request: Request, { userId }: { userId: string }): Promise<Response> {
  return change(request, userId, false);
}

/** Invites a friend to a table (STO-584): it reaches them on their next heartbeat. */
export async function POST(request: Request, { userId }: { userId: string }): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in to invite friends." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to invite friends." }, { status: 403 });
    const body: unknown = await request.json().catch(() => null);
    const roomId = typeof body === "object" && body !== null && "roomId" in body ? body.roomId : null;
    if (typeof roomId !== "string" || !ROOM_ID_PATTERN.test(roomId)) {
      return Response.json({ error: "That table couldn't be read." }, { status: 400 });
    }
    if (!userId || userId.length > 256 || !(await inviteToTable(user.id, userId, roomId))) {
      return Response.json({ error: "That friend couldn't be found." }, { status: 404 });
    }
    // A friend whose app is open gets the in-app banner; one who is not gets a push (STO-585).
    if (!(await isOnline(userId))) {
      void notifyUsers([userId], "tableInvite", {
        title: "Table invite", body: `${user.name} invited you to a table`, url: `wordpoker://online/${roomId}`,
      });
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: "Friends aren't available right now. Try again." }, { status: 503 });
  }
}
