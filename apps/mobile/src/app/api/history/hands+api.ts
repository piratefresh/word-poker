import { HAND_RECORD_MAX_BYTES, parseHandRecord, historyHand, isHistoryCursor } from "@wordpoker/contracts";
import { HandRecordConflictError, readHistoryHands, saveHistoryHand } from "@wordpoker/db";
import { loadDictionary, verifyHandRecord } from "@wordpoker/game-rules";
import { historyUser } from "@/auth/server/history-user";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const userId = await historyUser(request);
  if (!userId) return json({ error: "Sign in to see your history." }, 401);
  const cursor = new URL(request.url).searchParams.get("cursor");
  if (cursor !== null && !isHistoryCursor(cursor)) return json({ error: "Invalid cursor." }, 400);
  try {
    return json(await readHistoryHands(userId, cursor));
  } catch (error) {
    console.error("[history] read failed", error);
    return json({ error: "History could not be read. Your saved hands are still on this device." }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await historyUser(request);
  if (!userId) return json({ error: "Sign in to save your history." }, 401);
  // Bound the streamed body before allocating/parsing an uploaded action log.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: "Missing hand." }, 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > HAND_RECORD_MAX_BYTES) {
      await reader.cancel();
      return json({ error: "Hand is too large." }, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const record = parseHandRecord(new TextDecoder().decode(bytes));
  if (!record || record.mode !== "offline" || record.ranked ||
    record.seats.filter((seat) => seat.userId !== null).length !== 1 ||
    record.seats.find((seat) => seat.userId !== null)?.userId !== userId) {
    return json({ error: "Invalid offline hand or account." }, 400);
  }
  try {
    const verified = verifyHandRecord(record, await loadDictionary(record.dictionaryId));
    if (!verified.ok) return json({ error: verified.refusal.reason }, 422);
    const canonical = { ...record, ranked: false, summary: verified.summary };
    const result = await saveHistoryHand(canonical, { ownerId: userId });
    const hero = record.seats.find((seat) => seat.userId === userId);
    if (!hero) return json({ error: "Missing player." }, 400);
    return json(historyHand(canonical, result.id, hero.playerId), result.status === "recorded" ? 201 : 200);
  } catch (error) {
    if (error instanceof HandRecordConflictError) return json({ error: "This hand identity already contains a different result." }, 409);
    console.error("[history] upload failed", error);
    return json({ error: "The hand is still pending. Try again when connected." }, 503);
  }
}
