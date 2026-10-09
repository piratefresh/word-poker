import { seatFixture, snapshotFixture } from "@/components/screens/results/results-fixtures";

import { resultsFacts } from "./quest-facts";

describe("resultsFacts", () => {
  test("a folded player's new scoreboard card does not change quest reporting", () => {
    const snapshot = snapshotFixture({ seats: [seatFixture({ name: "Guest", isYou: true, folded: true })] });
    expect(resultsFacts(snapshot, { wildTable: false, heroUsedPower: false })).toBeNull();
  });
  test("a showdown win carries the hero's word, score, decider and the pot", () => {
    const snapshot = snapshotFixture({
      pot: 300,
      seats: [
        seatFixture({ name: "Guest", isYou: true, word: "ENVIRO", total: 17, decidedBy: "word-length", takesPot: true }),
        seatFixture({ name: "Ellis", place: 2 }),
      ],
    });

    expect(resultsFacts(snapshot, { wildTable: false, heroUsedPower: false })).toEqual({
      revealed: true,
      heroWon: true,
      heroWord: "ENVIRO",
      heroScore: 17,
      heroDecidedBy: "word-length",
      pot: 300,
      wildTable: false,
      heroUsedPower: false,
    });
  });

  test("a showdown loss reads heroWon false off the hero's own place, not the winner's", () => {
    const snapshot = snapshotFixture({
      seats: [
        seatFixture({ name: "Ellis", takesPot: true }),
        seatFixture({ name: "Guest", isYou: true, place: 2, word: "ROW", total: 8 }),
      ],
    });

    const facts = resultsFacts(snapshot, { wildTable: false, heroUsedPower: false });
    expect(facts?.heroWon).toBe(false);
    expect(facts?.heroWord).toBe("ROW");
  });

  test("a fold-out reads heroWon off takesPot, with no decider and no word", () => {
    const snapshot = snapshotFixture({
      revealed: false,
      pot: 600,
      table: { players: 4, folded: 3 },
      seats: [seatFixture({ name: "Guest", isYou: true, takesPot: true, decidedBy: null })],
    });

    expect(resultsFacts(snapshot, { wildTable: true, heroUsedPower: true })).toEqual({
      revealed: false,
      heroWon: true,
      heroWord: null,
      heroScore: 0,
      heroDecidedBy: null,
      pot: 600,
      wildTable: true,
      heroUsedPower: true,
    });
  });

  test("a no-word seat reports a null word and a score of 0", () => {
    const snapshot = snapshotFixture({
      seats: [
        seatFixture({ name: "Ellis", takesPot: true }),
        seatFixture({ name: "Guest", isYou: true, place: 2, reason: "timer-expired" }),
      ],
    });

    const facts = resultsFacts(snapshot, { wildTable: false, heroUsedPower: false });
    expect(facts?.heroWord).toBeNull();
    expect(facts?.heroScore).toBe(0);
  });

  test("is null when the snapshot has no hero seat at all", () => {
    const snapshot = snapshotFixture({ seats: [seatFixture({ name: "Ellis", takesPot: true })] });

    expect(resultsFacts(snapshot, { wildTable: false, heroUsedPower: false })).toBeNull();
  });
});
