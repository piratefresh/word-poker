/**
 * results-rating.ts — one hand's report, as the database stores it (STO-379, spec §6).
 *
 * The row is a report about a *hand*, not about a person: it carries what makes the hand
 * identifiable (its number, and the seed it was dealt from) so a complaint can be replayed, and
 * nothing that identifies the player. That is why `handNo` + `seed` are the only identity here.
 *
 * The shape is declared with `defineEntity` rather than decorators: MikroORM 7 keeps decorators in
 * a separate `@mikro-orm/decorators` package, and this package deliberately has no metadata
 * provider beyond the default, reflection-free one — every property names its own type here, and
 * the hand-written migration spells the same types in SQL.
 */

import { defineEntity, p, type InferEntity } from "@mikro-orm/core";
import { randomUUID } from "node:crypto";

export const ResultsRating = defineEntity({
  name: "ResultsRating",
  tableName: "results_rating",
  properties: () => ({
    /**
     * Generated in JS rather than fetched back with `returning`, so a save never depends on the
     * round trip that produces it; the column default is the same expression for hand-run SQL.
     */
    id: p.uuid().primary().defaultRaw("gen_random_uuid()").onCreate(() => randomUUID()),
    createdAt: p.datetime().onCreate(() => new Date()),
    /** The hand's number within its table (`HAND #18 · RESULTS`), not a row count. */
    handNo: p.integer(),
    /**
     * The seed the hand was dealt from. The session's seed is a JS number up to 2^53, so the
     * column is `bigint` but the value stays a number rather than becoming a string.
     */
    seed: p.bigint("number"),
    /** 1–5, or null when the player left only tags or a note. */
    rating: p.smallint().nullable(),
    /** The flags the player ticked — `text[]`, empty by default. */
    tags: p.array().defaultRaw("'{}'"),
    /**
     * What the player typed, or null when they typed nothing. The 500-character ceiling is
     * enforced where the request is validated; this column is the backstop, not the rule.
     */
    note: p.text().nullable(),
  }),
});

/** The stored row, as `em.find` hands it back. */
export type ResultsRatingRow = InferEntity<typeof ResultsRating>;
