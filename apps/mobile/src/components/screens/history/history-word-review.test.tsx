import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type { HistoryHand } from "@wordpoker/contracts";
import { loadDictionary } from "@wordpoker/game-rules";

import { testDictionary } from "@/test-support/dictionary-fixtures";

import { HistoryWordReview } from "./history-word-review";

jest.mock("@wordpoker/game-rules", () => ({
  ...jest.requireActual("@wordpoker/game-rules"), loadDictionary: jest.fn(),
}));
jest.mock("../results/river-review", () => ({
  RiverReview: ({ words }: { words: readonly { word: string; score: number }[] }) => {
    const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText>{words.length ? words.map(({ word, score }) => `${word}: ${score}`).join(", ") : "No word was buildable."}</MockText>;
  },
}));

const hand: HistoryHand = {
  id: "s:1", sessionId: "s", handNo: 1, mode: "offline", ranked: false,
  startedAtMs: 0, endedAtMs: 1, dictionaryId: "en_US-large", heroId: "hero",
  seats: [{ playerId: "hero", name: "You", initialStack: 100 }], actions: [],
  summary: {
    outcome: "showdown", pots: [],
    community: ["R", "E", "T", "S", "N"].map((letter) => ({ id: letter, letter, points: 1 })),
    seats: [{ playerId: "hero", privateTiles: [
      { id: "C", letter: "C", points: 3, multiplier: "double-letter" },
      { id: "A", letter: "A", points: 1 },
    ], submission: null, word: null, score: 0, reason: null, place: null, finalStack: 100 }],
  },
};

beforeEach(() => {
  jest.mocked(loadDictionary).mockReset();
  jest.mocked(loadDictionary).mockResolvedValue(testDictionary(["CAT", "CATS", "CART", "CARE"]));
});

test("opens the existing review on demand with the best three words and multiplier scores, then closes", async () => {
  const view = await render(<HistoryWordReview hand={hand} />);
  expect(loadDictionary).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole("button", { name: "See 3 possible words" }));
  expect(await view.findByText("CARE: 9, CART: 9, CATS: 9")).toBeOnTheScreen();
  expect(loadDictionary).toHaveBeenCalledWith(hand.dictionaryId);
  await fireEvent.press(view.getByRole("button", { name: "CLOSE" }));
  expect(view.queryByText("WORDS YOU COULD HAVE PLAYED")).toBeNull();
});

test("shows the review's empty state when no word is possible", async () => {
  jest.mocked(loadDictionary).mockResolvedValue(testDictionary(["ZOO"]));
  const view = await render(<HistoryWordReview hand={hand} />);
  await fireEvent.press(view.getByRole("button", { name: "See 3 possible words" }));
  expect(await view.findByText("No word was buildable.")).toBeOnTheScreen();
});

test("retries a failed dictionary load", async () => {
  jest.mocked(loadDictionary).mockRejectedValueOnce(new Error("unavailable"));
  const view = await render(<HistoryWordReview hand={hand} />);
  await fireEvent.press(view.getByRole("button", { name: "See 3 possible words" }));
  await waitFor(() => expect(view.getByText("Could not load possible words. Please try again.")).toBeOnTheScreen());
  await fireEvent.press(view.getByRole("button", { name: "TRY AGAIN" }));
  expect(await view.findByText("CARE: 9, CART: 9, CATS: 9")).toBeOnTheScreen();
});

test("does not offer a review for a hidden board, hidden rack, or an existing word", async () => {
  for (const summary of [
    { ...hand.summary, community: [] },
    { ...hand.summary, seats: [{ ...hand.summary.seats[0], privateTiles: [] }] },
    { ...hand.summary, seats: [{ ...hand.summary.seats[0], word: "CAT" }] },
  ]) {
    const view = await render(<HistoryWordReview hand={{ ...hand, summary }} />);
    expect(view.queryByRole("button")).toBeNull();
    await view.unmount();
  }
  expect(loadDictionary).not.toHaveBeenCalled();
});
