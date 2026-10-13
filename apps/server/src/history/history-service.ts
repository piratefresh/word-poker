/** Transactional history writes; the journal retains uncommitted settlements on restart. */

import type { MikroORM } from "@mikro-orm/postgresql";
import type { HandRecord } from "@wordpoker/contracts";

import { getOrm, saveHistoryHand } from "@wordpoker/db";
export { HandRecordConflictError, handRecordDigest } from "@wordpoker/db";
import { SettlementJournal } from "./settlement-journal.js";

/** What a recorder needs from the store: write one hand, idempotently, or throw. */
export interface HistoryWriter {
  stageHand?(record: HandRecord): void;
  recordHand(record: HandRecord): Promise<"recorded" | "duplicate">;
}

/**
 * The env var that points the room server at the history database. Explicit, never inherited:
 * the room process must not silently start writing to whatever `DATABASE_URL` happens to name.
 */
export const HISTORY_DATABASE_URL = "WORDPOKER_HISTORY_DATABASE_URL";

export class HistoryService implements HistoryWriter {
  constructor(private readonly orm: MikroORM, private readonly journal?: SettlementJournal) {}

  /**
   * The process's history service, from the room server's own env: present only when
   * `WORDPOKER_HISTORY_DATABASE_URL` names a database. A room without it runs unrecorded and
   * says so once at creation — production sets it; nothing falls back to `DATABASE_URL`.
   */
  static async fromEnv(): Promise<HistoryService | null> {
    const url = process.env[HISTORY_DATABASE_URL];
    if (url === undefined || url.length === 0) return null;

    const directory = process.env.WORDPOKER_HISTORY_JOURNAL_DIR;
    if (!directory) throw new Error("WORDPOKER_HISTORY_JOURNAL_DIR must name a persistent settlement directory");
    return new HistoryService(await getOrm(url), new SettlementJournal(directory));
  }

  stageHand(record: HandRecord): void {
    this.journal?.capture(record);
  }

  /** Recovery needs no surviving room or connected client. Failed entries remain on disk. */
  async recoverPending(): Promise<void> {
    for (const record of this.journal?.records() ?? []) await this.recordHand(record);
  }

  async recordHand(record: HandRecord): Promise<"recorded" | "duplicate"> {
    const result = await saveHistoryHand(record, { orm: this.orm });
    this.journal?.acknowledge(record);
    return result.status;
  }
}
