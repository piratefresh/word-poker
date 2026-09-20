/**
 * offline-seed.ts — where the offline table's seed comes from.
 *
 * `@wordpoker/game-rules` never reaches for randomness of its own: a seed arrives as an
 * argument and replays the same hand every time it is played (AGENTS.md). Somebody above the
 * engine has to pick that seed, and this is that somebody — the table draws a fresh one every
 * time it is set, so two visits to offline play are two hands rather than the same rehearsal,
 * unless the URL pins one and the table plays exactly the hand someone else saw.
 *
 * It lives in its own module so the draw can be stood in for: a test that mocks `randomSeed`
 * sits down at the exact hand the app's randomness would have dealt, which is the only way to
 * assert what a table does with a seed nobody knows in advance.
 */

/**
 * A seed for a table nobody pinned: a non-negative int32 drawn from the app's own randomness.
 * Nothing here is a secret, and nothing is at stake in which seed comes out — the engine only
 * ever replays it.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/**
 * The seed a URL pins (`/offline?seed=…`), or `undefined` when it pins none. The E2E flow and
 * a bug report both need to sit down at the exact hand someone else saw, and a pinned seed is
 * what makes the hand they are looking at the hand they can name.
 *
 * A repeated parameter (`?seed=1&seed=2`) takes the first, as the rest of the app reads a
 * param. Anything that is not a finite number is not a pin, and the table draws its own.
 */
export function pinnedSeed(param: string | string[] | undefined): number | undefined {
  const raw = (Array.isArray(param) ? param[0] : param)?.trim();
  if (raw === undefined || raw === "") return undefined;

  const seed = Number(raw);
  return Number.isFinite(seed) ? seed : undefined;
}
