/**
 * The rating module's own contract: one POST to the app's own route, one readable refusal.
 *
 * `fetch` is the seam here, and the host is not part of what this file judges - the app's host
 * module is stubbed so the assertion is about the URL this module builds on top of `apiBaseURL`
 * rather than about how Expo resolves the dev server (that resolution is unchanged).
 */

import { RATING_TAGS, sendResultsRating, type ResultsRatingInput } from "./results-rating";

jest.mock("@/lib/network/api-base-url", () => ({ apiBaseURL: "https://api.wordpoker.test" }));

/** One hand's report, as the card would hand it over: a level, two tags and a note. */
const RATING: ResultsRatingInput = {
  handNo: 18,
  seed: 20_260_919,
  rating: 4,
  tags: ["Pacing", "Bug"],
  note: "The deal animation stuttered on the second hand.",
};

/** The two shapes a real response takes for this route: a JSON body, and a status. */
function reply(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("sendResultsRating", () => {
  test("posts the hand's identity and everything the player left in one JSON body", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "9f1c4a" }));

    await expect(sendResultsRating(RATING)).resolves.toEqual({ id: "9f1c4a" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.wordpoker.test/api/results-rating");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    // The exact body the route validates: the hand, its seed, and the three things a player
    // can leave - a level, tags, a note - as they left them.
    expect(JSON.parse(String(init.body))).toEqual({
      handNo: 18,
      seed: 20_260_919,
      rating: 4,
      tags: ["Pacing", "Bug"],
      note: "The deal animation stuttered on the second hand.",
    });
  });

  test("carries a null level for a report that is tags and a note only", async () => {
    fetchMock.mockResolvedValue(reply(201, { id: "9f1c4b" }));

    await sendResultsRating({ ...RATING, rating: null, tags: ["Suggestion"] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      rating: null,
      tags: ["Suggestion"],
    });
  });

  test("rejects with the server's own message when the route refuses it", async () => {
    fetchMock.mockResolvedValue(reply(400, { error: "note is longer than 500 characters" }));

    await expect(sendResultsRating({ ...RATING, rating: null, tags: [] })).rejects.toThrow(
      "note is longer than 500 characters",
    );
  });

  test("rejects with the status when the refusal is not a JSON body", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    } as unknown as Response);

    await expect(sendResultsRating(RATING)).rejects.toThrow("502");
  });

  test("rejects a 2xx that stored nothing, rather than claiming success", async () => {
    fetchMock.mockResolvedValue(reply(201, { stored: true }));

    await expect(sendResultsRating(RATING)).rejects.toThrow("no id");
  });

  test("keeps the six tags the route accepts, in one order", () => {
    expect(RATING_TAGS).toEqual([
      "Gameplay",
      "Scoring",
      "Pacing",
      "Visuals",
      "Bug",
      "Suggestion",
    ]);
  });
});
