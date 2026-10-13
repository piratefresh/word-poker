import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isHandRecord, type HandRecord } from "@wordpoker/contracts";

/** Fsynced before settlement publication; retain this directory on a persistent volume. */
export class SettlementJournal {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  capture(record: HandRecord): void {
    if (!isHandRecord(record)) throw new Error("invalid settlement journal record");
    const destination = this.path(record);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(record), { flag: "wx", mode: 0o600, flush: true });
      renameSync(temporary, destination);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  records(): HandRecord[] {
    const records: HandRecord[] = [];
    for (const name of readdirSync(this.directory).filter((name) => name.endsWith(".json"))) {
      try {
        const record: unknown = JSON.parse(readFileSync(join(this.directory, name), "utf8"));
        if (!isHandRecord(record)) throw new Error(`invalid settlement journal entry: ${name}`);
        records.push(record);
      } catch (error) {
        console.error(`history: reading settlement journal entry ${name} failed`, error);
      }
    }
    return records;
  }

  acknowledge(record: HandRecord): void {
    rmSync(this.path(record), { force: true });
  }

  private path(record: HandRecord): string {
    // Payload-specific names retain conflicting records rather than overwrite them.
    const digest = createHash("sha256").update(JSON.stringify(record)).digest("hex");
    return join(this.directory, `${digest}.json`);
  }
}
