import { createHash, randomUUID } from "node:crypto";
import type { MikroORM, Transaction } from "@mikro-orm/postgresql";
import type { HandRecord } from "@wordpoker/contracts";
import { getOrm } from "./orm";

export function handRecordDigest(record: HandRecord): string {
  return createHash("sha256").update(JSON.stringify(record, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]]));
    }
    return value;
  })).digest("hex");
}

export class HandRecordConflictError extends Error {
  constructor(sessionId: string, handNo: number) {
    super(`hand ${handNo} of session ${sessionId} is already recorded with a different payload`);
    this.name = "HandRecordConflictError";
  }
}

/** The caller validates/replays; this writer commits the immutable record atomically. */
export async function saveHistoryHand(record: HandRecord, options: { ownerId?: string; orm?: MikroORM } = {}): Promise<{ status: "recorded" | "duplicate"; id: string }> {
  const orm = options.orm ?? await getOrm();
  const ownerId = options.ownerId ?? null;
  if ((record.mode === "offline") !== (ownerId !== null)) throw new Error("history owner does not match mode");
  const digest = handRecordDigest(record);
  const handId = randomUUID();
  const db = orm.em.getConnection();

  const result = await db.transactional(async (trx: Transaction): Promise<{ status: "recorded" | "duplicate"; id: string }> => {
    // Serialize through commit so sync cannot skip a late lower insertion cursor.
    // ponytail: one history insertion lock; revisit if contention becomes measurable.
    await db.execute("select pg_advisory_xact_lock(451)", [], "all", trx);
    const [session] = await db.execute<{ mode: string; owner_id: string | null }[]>(
      "select mode, owner_id from game_session where id = ?", [record.sessionId], "all", trx,
    );
    if (session && (session.mode !== record.mode || session.owner_id !== ownerId)) {
      throw new HandRecordConflictError(record.sessionId, record.handNo);
    }
    const [existing] = await db.execute<{ id: string; payload_digest: string }[]>(
      `select "id", "payload_digest" from "game_hand" where "session_id" = ? and "hand_no" = ?`,
      [record.sessionId, record.handNo],
      "all",
      trx,
    );
    if (existing !== undefined) {
      if (existing.payload_digest === digest) return { status: "duplicate", id: existing.id };
      throw new HandRecordConflictError(record.sessionId, record.handNo);
    }
    // The session rides with its first recorded hand; a re-record of any hand finds it there.
    await db.execute(
      `insert into "game_session" ("id", "mode", "owner_id") values (?, ?, ?)
       on conflict do nothing`,
      [record.sessionId, record.mode, ownerId],
      "run",
      trx,
    );

    await db.execute(
      `insert into "game_hand"
         ("id", "session_id", "mode", "hand_no", "started_at", "ended_at", "version", "ranked",
          "seed", "dealer_seat", "rules_version", "dictionary_id", "dictionary_fingerprint",
          "payload_digest", "config", "summary")
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        handId,
        record.sessionId,
        record.mode,
        record.handNo,
        new Date(record.startedAtMs),
        new Date(record.endedAtMs),
        record.version,
        record.ranked,
        record.seed,
        record.dealerSeat,
        record.rulesVersion,
        record.dictionaryId,
        record.dictionaryFingerprint,
        digest,
        JSON.stringify(record.config),
        JSON.stringify(record.summary),
      ],
      "run",
      trx,
    );

    for (const [seat, entry] of record.seats.entries()) {
      await db.execute(
        `insert into "hand_seat" ("hand_id", "seat", "player_id", "user_id", "name", "initial_stack")
         values (?, ?, ?, ?, ?, ?)`,
        [handId, seat, entry.playerId, entry.userId, entry.name, entry.initialStack],
        "run",
        trx,
      );
    }

    for (const entry of record.actions) {
      await db.execute(
        `insert into "hand_action" ("hand_id", "sequence", "at", "source", "action")
         values (?, ?, ?, ?, ?)`,
        [handId, entry.sequence, new Date(entry.atMs), entry.source, JSON.stringify(entry.action)],
        "run",
        trx,
      );
    }

    return { status: "recorded", id: handId };
  });
  return result;
}
