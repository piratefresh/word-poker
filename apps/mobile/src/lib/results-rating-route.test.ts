/**
 * The rating route's own contract: what it accepts, what it refuses, and what it writes.
 *
 * The route is the only place an untrusted body is read, and the store is the seam — stubbing
 * `@wordpoker/db` keeps the test off Postgres (the package's own integration test is where the
 * table is judged) and lets a refusal be told apart from a write: a `400` must reach the database
 * with nothing at all.
 */

import { saveResultsRating } from "@wordpoker/db";

import { POST } from "@/app/api/results-rating+api";

jest.mock("@wordpoker/db", () => ({ saveResultsRating: jest.fn(async () => "rating-1") }));

const save = jest.mocked(saveResultsRating);

/** One hand's report, as the card sends it. */
const BODY = { handNo: 18, seed: 20_260_919, rating: 4, tags: ["Pacing"], note: "The turn took a while." };

/** Posts `body` to the route as JSON, exactly as the client module does. */
function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost:8081/api/results-rating", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  save.mockClear();
  save.mockResolvedValue("rating-1");
});

describe("POST /api/results-rating", () => {
  test("stores a rating and answers with its id", async () => {
    const response = await post(BODY);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "rating-1" });
    expect(save).toHaveBeenCalledWith({
      handNo: 18,
      seed: 20_260_919,
      rating: 4,
      tags: ["Pacing"],
      note: "The turn took a while.",
    });
  });

  test("takes tags and a note on their own, with no level chosen", async () => {
    const response = await post({ handNo: 2, seed: 7, tags: ["Bug"], note: "The pot counted twice." });

    expect(response.status).toBe(201);
    expect(save).toHaveBeenCalledWith({
      handNo: 2,
      seed: 7,
      rating: null,
      tags: ["Bug"],
      note: "The pot counted twice.",
    });
  });

  test("refuses garbage and writes nothing", async () => {
    const bodies: unknown[] = [
      // Not JSON at all…
      "not json",
      // …or not an object.
      [BODY],
      null,
      // The hand's identity is required and has to be a real hand.
      { ...BODY, handNo: undefined },
      { ...BODY, handNo: -1 },
      { ...BODY, handNo: 1.5 },
      { ...BODY, seed: "20260919" },
      { ...BODY, seed: 1.5 },
      // The level is 1–5 when it is there at all.
      { ...BODY, rating: 0 },
      { ...BODY, rating: 6 },
      { ...BODY, rating: "4" },
      // Tags are the six, each once.
      { ...BODY, tags: "Bug" },
      { ...BODY, tags: ["Nonsense"] },
      { ...BODY, tags: ["Bug", "Bug"] },
      // The note is a string inside the column's ceiling.
      { ...BODY, note: 42 },
      { ...BODY, note: "x".repeat(501) },
      // And a body with nothing in it is not a rating.
      { handNo: 1, seed: 1, rating: null, tags: [], note: "   " },
    ];

    for (const body of bodies) {
      const response = await post(body);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toHaveProperty("error");
    }

    expect(save).not.toHaveBeenCalled();
  });

  test("answers 500 without the store's own failure when the row cannot be written", async () => {
    // The route logs the failure on purpose (its text can hold credentials) and answers without
    // it. The log is the route doing its job, not something for this test's output.
    const logged = jest.spyOn(console, "error").mockImplementation(() => undefined);
    save.mockRejectedValue(new Error("password authentication failed for user \"wordpoker\""));

    const response = await post(BODY);

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string };
    expect(body.error).not.toContain("password");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
