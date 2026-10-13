import { readHistoryHand } from "@wordpoker/db";
import { historyUser } from "@/auth/server/history-user";

export async function GET(request: Request, { id }: { id: string }): Promise<Response> {
  const userId = await historyUser(request);
  if (!userId) return Response.json({ error: "Sign in to see your history." }, { status: 401 });
  try {
    const hand = await readHistoryHand(userId, id);
    return Response.json(hand ?? { error: "Hand not found." }, {
      status: hand ? 200 : 404, headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[history] detail failed", error);
    return Response.json({ error: "History could not be read." }, { status: 503 });
  }
}
