import { acceptFriend, removeFriend } from "@wordpoker/db";
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
