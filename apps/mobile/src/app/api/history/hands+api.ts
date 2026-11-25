import { HAND_RECORD_MAX_BYTES, parseHandRecord, historyHand, isHistoryCursor } from "@wordpoker/contracts";
import { HandRecordConflictError, readHistoryHands, saveHistoryHand } from "@wordpoker/db";
import { awardVipHand, awardVipMatch } from "@wordpoker/economy";
import { loadDictionary, verifyHandRecord, vipFactsFromReplay } from "@wordpoker/game-rules";
import { sessionUser } from "@/auth/server/session-user";

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request): Promise<Response> {
  const userId = (await sessionUser(request))?.id;
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
  const user = await sessionUser(request);
  const userId = user?.id;
  if (!user || !userId) return json({ error: "Sign in to save your history." }, 401);
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
  if (!record) return json({ error: "Invalid offline hand: the record failed validation." }, 400);
  if (record.mode !== "offline" || record.ranked) return json({ error: "Invalid offline hand: not an unranked offline hand." }, 400);
  if (record.seats.filter((seat) => seat.userId !== null).length !== 1 ||
    record.seats.find((seat) => seat.userId !== null)?.userId !== userId) {
    return json({ error: "Invalid offline hand: it was recorded under a different account." }, 400);
  }
  try {
    const verified = verifyHandRecord(record, await loadDictionary(record.dictionaryId));
    if (!verified.ok) return json({ error: verified.refusal.reason }, 422);
    const canonical = { ...record, ranked: false, summary: verified.summary };
    const result = await saveHistoryHand(canonical, { ownerId: userId });
    const hero = record.seats.find((seat) => seat.userId === userId);
    if (!hero) return json({ error: "Missing player." }, 400);
    // VIP Points come from the verified replay, never the client's claim (STO-1170). Offline
    // hands never earn betting points; a failure here never fails the upload.
    if (user.eligible === true) {
      const facts = vipFactsFromReplay(verified, hero.playerId, { betting: false, handInSession: record.handNo });
      const token = `offline:${record.sessionId}:${record.handNo}`;
      try {
        if (facts) await awardVipHand(userId, token, facts);
        if (verified.state.sessionOver) await awardVipMatch(userId, `offline:${record.sessionId}`);
      } catch (error) {
        console.error("[history] vip award failed", error);
      }
    }
    return json(historyHand(canonical, result.id, hero.playerId), result.status === "recorded" ? 201 : 200);
  } catch (error) {
    if (error instanceof HandRecordConflictError) return json({ error: "This hand identity already contains a different result." }, 409);
    console.error("[history] upload failed", error);
    return json({ error: "The hand is still pending. Try again when connected." }, 503);
  }
}
