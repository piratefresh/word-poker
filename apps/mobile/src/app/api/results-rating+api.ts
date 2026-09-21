/**
 * results-rating+api.ts — where the results screen's rating lands (STO-379, spec §6).
 *
 * This route is the only thing that reads the request body, and it refuses a body it cannot store
 * rather than trusting the caller: the card is the app's own component, but the endpoint is
 * reachable by anything that can talk to the dev server. Everything it accepts is checked here,
 * and `@wordpoker/db` stores what it is handed.
 *
 * The store lives in the workspace's one database package. This app never opens a Postgres
 * connection of its own — `src/lib/auth.ts` owns the only pool, and it is the auth provider's.
 */

import { saveResultsRating } from "@wordpoker/db";

/**
 * The six things a player can flag. Written out rather than imported from the card's module:
 * that one reaches for `SecureStore` and Expo's constants, which have no business in a server
 * route. The card (`src/lib/results-rating.ts`) and this route are the pair that has to agree.
 */
const TAGS = ["Gameplay", "Scoring", "Pacing", "Visuals", "Bug", "Suggestion"] as const;

/** The note's ceiling in characters — the column's limit and the card's `maxLength`. */
const NOTE_MAX = 500;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A refusal: what was wrong, and nothing about what the server is running. */
function refuse(message: string): Response {
  return json({ error: message }, 400);
}

/** Whether the body's tags are the six, each at most once. */
function areTags(value: unknown): value is (typeof TAGS)[number][] {
  return (
    Array.isArray(value) &&
    value.every((tag) => typeof tag === "string" && (TAGS as readonly string[]).includes(tag)) &&
    new Set(value).size === value.length
  );
}

/**
 * Stores one hand's rating.
 *
 * `201` with the stored id, or `400` with the reason. A store failure is a `500` carrying a short
 * sentence: the exception's text can hold the database's URL and credentials, so it is logged and
 * never sent.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return refuse("Body must be JSON");
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return refuse("Body must be a JSON object");
  }

  const { handNo, seed, rating, tags, note } = body as Record<string, unknown>;

  if (typeof handNo !== "number" || !Number.isInteger(handNo) || handNo < 0) {
    return refuse("handNo must be a non-negative integer");
  }

  if (typeof seed !== "number" || !Number.isSafeInteger(seed)) {
    return refuse("seed must be a safe integer");
  }

  if (
    rating !== undefined &&
    rating !== null &&
    (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5)
  ) {
    return refuse("rating must be an integer from 1 to 5, or absent");
  }

  if (!areTags(tags)) {
    return refuse(`tags must be an array drawn from ${TAGS.join(", ")}, without repeats`);
  }

  if (note !== undefined && typeof note !== "string") {
    return refuse("note must be a string");
  }

  const text = typeof note === "string" ? note : "";

  if (text.length > NOTE_MAX) {
    return refuse(`note must be at most ${NOTE_MAX} characters`);
  }

  // A body with nothing in it is not a rating — it is a mis-wired client, and storing it would
  // make the table's rows worthless.
  if ((rating ?? null) === null && tags.length === 0 && text.trim() === "") {
    return refuse("Send a rating, at least one tag, or a note");
  }

  try {
    const id = await saveResultsRating({
      handNo,
      seed,
      rating: rating ?? null,
      tags,
      note: text,
    });

    return json({ id }, 201);
  } catch (error) {
    console.error("[results-rating] could not store the rating:", error);

    return json({ error: "Could not store the rating" }, 500);
  }
}
