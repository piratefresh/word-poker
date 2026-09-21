/**
 * Migration20260921030429_results_rating.ts — the rating table (STO-379, spec §6).
 *
 * Written by hand rather than generated: there is exactly one table, it is new, and a hand-written
 * pair of statements says what it does without a snapshot file to diff against. The column types
 * are the ones `src/entities/results-rating.ts` declares — `datetime` on the entity is `timestamptz`
 * here, and the integration test reads a row back through the entity to keep the two honest.
 *
 * `gen_random_uuid()` is built into Postgres 13+, so the id needs no extension; the entity fills
 * the same value from JS, and this default is what makes a hand-run INSERT work.
 */

import { Migration } from "@mikro-orm/migrations";

export class Migration20260921030429_results_rating extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      create table "results_rating" (
        "id" uuid primary key default gen_random_uuid(),
        "created_at" timestamptz not null default now(),
        "hand_no" int not null,
        "seed" bigint not null,
        "rating" smallint null,
        "tags" text[] not null default '{}',
        "note" text null
      );
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "results_rating";`);
  }
}
