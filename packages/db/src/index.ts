/**
 * index.ts — what the rest of the workspace may use this package for (STO-379, spec §6).
 *
 * Two things: the entity (so a caller can query it) and one writer for the results screen's
 * rating. Nothing validates here — the API route owns the request shape and refuses a bad body
 * before it reaches this package, and the entity's column types are the backstop under that.
 *
 * The ORM is cached for the life of the process. An API route is a long-lived server process
 * serving many requests, and a per-request `MikroORM.init` would open (and leak) a connection
 * pool per request. `getOrm`/`closeOrm` are exported so a test can drive the same instance, and
 * `saveResultsRating` takes an optional `orm` so a test can point at its own database without
 * touching the process-wide one.
 */

import { MikroORM } from "@mikro-orm/postgresql";

import config from "../mikro-orm.config";
import { ResultsRating } from "./entities/index";

export { ResultsRating } from "./entities/index";

/** One hand's report: which hand, how it felt, and what stood out about it. */
export interface ResultsRatingInput {
  /** The hand's number within its table (`HAND #18`). */
  readonly handNo: number;
  /** The seed the hand was dealt from — what makes a report replayable. */
  readonly seed: number;
  /** 1–5, or null when the player left only tags or a note. */
  readonly rating: number | null;
  readonly tags: readonly string[];
  /** The player's own words; empty when the form was left to the chips. */
  readonly note: string;
}

let orm: Promise<MikroORM> | undefined;

/** The process's one ORM instance, connected on first use. */
export function getOrm(): Promise<MikroORM> {
  orm ??= MikroORM.init(config);

  return orm;
}

/** Closes the process's ORM instance; safe to call when nothing was opened. */
export async function closeOrm(): Promise<void> {
  const pending = orm;
  orm = undefined;

  if (pending) {
    const instance = await pending;
    await instance.close(true);
  }
}

/** Stores one rating and resolves with its id. */
export async function saveResultsRating(
  input: ResultsRatingInput,
  options: { orm?: MikroORM } = {},
): Promise<string> {
  const instance = options.orm ?? (await getOrm());
  const em = instance.em.fork();

  const rating = em.create(ResultsRating, {
    handNo: input.handNo,
    seed: input.seed,
    rating: input.rating,
    // Copied rather than aliased: the entity owns its array, and the caller's may be frozen.
    tags: [...input.tags],
    note: input.note,
  });

  em.persist(rating);
  await em.flush();

  return rating.id;
}
