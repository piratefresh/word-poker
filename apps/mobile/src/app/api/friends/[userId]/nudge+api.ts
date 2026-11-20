import { NUDGE_MESSAGES } from "@wordpoker/contracts";
import { notifyUsers, nudge } from "@wordpoker/db";
import { sessionUser } from "@/auth/server/session-user";

/** Nudges a friend to come and play: a push that opens the lobby, at most once per friend per cooldown. */
export async function POST(request: Request, { userId }: { userId: string }): Promise<Response> {
  try {
    const user = await sessionUser(request);
    if (!user) return Response.json({ error: "Sign in to nudge friends." }, { status: 401 });
    if (user.anonymous) return Response.json({ error: "Sign up to nudge friends." }, { status: 403 });
    if (!userId || userId.length > 256) return Response.json({ error: NUDGE_MESSAGES["not-friends"] }, { status: 404 });
    const result = await nudge(user.id, userId);
    if (result === "not-friends") return Response.json({ error: NUDGE_MESSAGES[result] }, { status: 404 });
    if (result === "too-soon") return Response.json({ error: NUDGE_MESSAGES[result] }, { status: 429 });
    // Best-effort, like every push: the nudge is already recorded, and the friend's switch decides.
    void notifyUsers([userId], "nudge", { title: "Nudge", body: `${user.name} wants to play`, url: "wordpoker://online" });
    return Response.json({ result, message: NUDGE_MESSAGES[result] }, { status: 201 });
  } catch {
    return Response.json({ error: "Friends aren't available right now. Try again." }, { status: 503 });
  }
}
