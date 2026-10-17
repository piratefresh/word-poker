/**
 * results-rating.ts - what a player says about the hand they just played (STO-385, spec section 5).
 *
 * The card is a form, not a client: it never reaches for the network itself, so this module is
 * the one place that knows the route, the body's shape and the server's error shape. That keeps
 * the screen's tests off the network (they stub this module) and keeps the host resolution in a
 * single file - `@/lib/network/api-base-url`'s, which every route this app calls is served from.
 *
 * The payload is the identity of the hand plus whatever the player left. The hand's number and
 * its seed are what make a report replayable: a bug report about "the deal animation" is only
 * actionable against the hand that was dealt, not against a screenshot of a score.
 */

import { apiBaseURL } from "@/lib/network/api-base-url";

/** The six things a player can flag, in the order the card lays them out. */
export const RATING_TAGS = [
  "Gameplay",
  "Scoring",
  "Pacing",
  "Visuals",
  "Bug",
  "Suggestion",
] as const;

export type RatingTag = (typeof RATING_TAGS)[number];

/** The note's ceiling in characters - the column's limit, enforced in the field as well. */
export const RATING_NOTE_MAX = 500;

/** One hand's report: which hand, how it felt, and what stood out about it. */
export interface ResultsRatingInput {
  readonly handNo: number;
  /** The seed the hand was dealt from - what makes a report replayable. */
  readonly seed: number;
  /** 1-5, or null when the player left only tags or a note. */
  readonly rating: number | null;
  readonly tags: readonly RatingTag[];
  readonly note: string;
}

/** Where the app serves the rating: an Expo API route, `src/app/api/results-rating+api.ts`. */
const RATING_PATH = "/api/results-rating";

/**
 * POSTs to `/api/results-rating`; resolves with the stored id, rejects with the server's message.
 *
 * A refusal is reported with the server's own sentence when it sent one - a body that is not
 * JSON says nothing a player can act on, so the status stands in for it. An empty line would
 * read as a silent failure, which is the one thing a failed report must not look like.
 */
export async function sendResultsRating(
  input: ResultsRatingInput,
): Promise<{ id: string }> {
  const response = await fetch(`${apiBaseURL}${RATING_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let detail = `The server refused it (HTTP ${response.status}).`;
    try {
      const body = (await response.json()) as { error?: unknown };
      if (typeof body?.error === "string" && body.error.length > 0) {
        detail = body.error;
      }
    } catch {
      // Not JSON: nothing to read, and nothing to report but the status above.
    }
    throw new Error(detail);
  }

  const body = (await response.json()) as { id?: unknown };
  // The id is the proof it landed somewhere; a 2xx without one is a server the app cannot
  // trust to have stored anything, so it is a failure here rather than a silent success.
  if (typeof body?.id !== "string") {
    throw new Error("The rating was accepted but the server sent no id.");
  }
  return { id: body.id };
}
