import type { GamePlayer, GameScreenState } from "../game-types";
import { bowlDirection, chipType, potBowlCue } from "./pot-bowl-motion";

const seat = (id: string, stack: number, status: GamePlayer["status"] = "waiting"): GamePlayer =>
  ({ id, name: id, initials: id, stack, color: "#000", status });

const game = (id: string, players: GamePlayer[], pot: number, handId = "h1"): GameScreenState =>
  ({ id, handId, players, pot, seatCount: 4, blinds: { smallBlind: 10, bigBlind: 20 } }) as unknown as GameScreenState;

describe("potBowlCue", () => {
  const before = game("t1", [seat("a", 500), seat("b", 500), seat("c", 500), seat("d", 500)], 30);

  it("ignores an optimistic render of the same turn", () => {
    expect(potBowlCue(before, { ...before, pot: 999 })).toBeNull();
  });

  it("tosses chips from the seat that paid, coloured by what it paid", () => {
    const after = game("t2", [seat("a", 500), seat("b", 500), seat("c", 380), seat("d", 500)], 150);
    expect(potBowlCue(before, after)).toEqual({ kind: "deposit", seat: 3, chipType: 2, fillLevel: 4 });
  });

  it("plays an all-in when the seat's stack runs out", () => {
    const after = game("t2", [seat("a", 0), seat("b", 500), seat("c", 500), seat("d", 500)], 530);
    expect(potBowlCue(before, after)).toMatchObject({ kind: "allIn", seat: 0, chipType: 3, fillLevel: 10 });
  });

  it("pays the new winner, and resets on a new hand", () => {
    const won = game("t2", [seat("a", 500), seat("b", 530, "winner"), seat("c", 500), seat("d", 500)], 0);
    expect(potBowlCue(before, won)).toEqual({ kind: "payout", winnerSeat: bowlDirection(1, 4) });
    expect(potBowlCue(won, game("t3", won.players as GamePlayer[], 30, "h2"))).toEqual({ kind: "reset", fillLevel: 1 });
  });
});

it("maps chip colours and tabletop seats to the bowl's directions", () => {
  expect([10, 50, 100, 500, 1000].map(chipType)).toEqual([0, 1, 2, 3, 4]);
  expect([0, 1, 2, 3].map((index) => bowlDirection(index, 4))).toEqual([0, 2, 3, 4]);
});
