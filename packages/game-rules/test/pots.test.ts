import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { WordScore } from "@wordpoker/contracts";

import type { BettingSeatState } from "../src/money/betting";
import { buildLivePots, buildPots, resolvePayout, splitAward, type JudgedSeat } from "../src/money/pots";

const START = 1_000;

/** A seat at the end of a hand: `committed` chips in the pots, the rest still in front of it. */
function seat(id: string, committed: number, overrides: Partial<BettingSeatState> = {}): BettingSeatState {
  return {
    id,
    stack: START - committed,
    committedRound: 0,
    committedHand: committed,
    folded: false,
    allIn: false,
    sittingOut: false,
    actedThisRound: false,
    ...overrides,
  };
}

/** A word worth `total`; the ladder only needs §7's total unless a test says otherwise. */
function word(total: number): WordScore {
  return { letters: [], letterScore: total, fullRackBonus: 0, total };
}

const judged = (playerId: string, seatIndex: number, total: number): JudgedSeat => ({
  playerId,
  seat: seatIndex,
  word: word(total),
});

describe("buildPots — §25's layering", () => {
  it("layers the §25 worked example into a main pot and one side pot", () => {
    const pots = buildPots([seat("a", 500), seat("b", 1_000), seat("c", 1_000)]);

    assert.deepEqual(pots, [
      { amount: 1_500, eligible: [0, 1, 2] },
      { amount: 1_000, eligible: [1, 2] },
    ]);
  });

  it("layers three differing all-in levels into three pots", () => {
    const pots = buildPots([seat("a", 300), seat("b", 600), seat("c", 900), seat("d", 900)]);

    assert.deepEqual(pots, [
      { amount: 1_200, eligible: [0, 1, 2, 3] },
      { amount: 900, eligible: [1, 2, 3] },
      { amount: 600, eligible: [2, 3] },
    ]);
  });

  it("merges a folded top contributor's slice down into the pot beneath it", () => {
    const pots = buildPots([seat("a", 200), seat("b", 200), seat("c", 300, { folded: true })]);

    // c's 300 has no eligible seat left, so it belongs to the main pot, where a and b are
    // already eligible: 600 + 100.
    assert.deepEqual(pots, [{ amount: 700, eligible: [0, 1] }]);
  });

  it("keeps a folded contributor's chips in the pots while never making it eligible", () => {
    const pots = buildPots([seat("a", 100, { folded: true }), seat("b", 300), seat("c", 300)]);

    assert.deepEqual(pots, [
      { amount: 300, eligible: [1, 2] },
      { amount: 400, eligible: [1, 2] },
    ]);
  });

  it("layers nothing when no chips were committed", () => {
    assert.deepEqual(buildPots([seat("a", 0), seat("b", 0)]), []);
  });

  it("conserves the chips committed: the pots always sum to the hand's commitments", () => {
    const tables: readonly (readonly BettingSeatState[])[] = [
      [seat("a", 0), seat("b", 0)],
      [seat("a", 20), seat("b", 20)],
      [seat("a", 500), seat("b", 1_000), seat("c", 1_000)],
      [seat("a", 300), seat("b", 600), seat("c", 900), seat("d", 900)],
      [seat("a", 100, { folded: true }), seat("b", 300), seat("c", 300)],
      [seat("a", 250, { folded: true }), seat("b", 250), seat("c", 700, { folded: true }), seat("d", 400)],
      [seat("a", 1_000), seat("b", 0, { sittingOut: true })],
    ];

    for (const table of tables) {
      const committed = table.reduce((total, entry) => total + entry.committedHand, 0);
      const potted = buildPots(table).reduce((total, pot) => total + pot.amount, 0);

      assert.equal(potted, committed, `expected ${JSON.stringify(table)} to conserve`);
    }
  });
});

describe("splitAward", () => {
  it("splits evenly with floor shares and no odd chip", () => {
    assert.deepEqual(splitAward(90, [0, 1, 2], 0, 4), [
      { seatIndex: 0, amount: 30 },
      { seatIndex: 1, amount: 30 },
      { seatIndex: 2, amount: 30 },
    ]);
  });

  it("gives the odd chip to the first winner clockwise from the dealer", () => {
    assert.deepEqual(splitAward(100, [0, 1, 2], 0, 4), [
      { seatIndex: 0, amount: 34 },
      { seatIndex: 1, amount: 33 },
      { seatIndex: 2, amount: 33 },
    ]);
  });

  it("counts clockwise past the dealer, wrapping the seat indexes", () => {
    // The dealer is seat 3, so the order is 3 → 1 → 2 and the two odd chips land on 3 and 1.
    assert.deepEqual(splitAward(101, [1, 2, 3], 3, 4), [
      { seatIndex: 3, amount: 34 },
      { seatIndex: 1, amount: 34 },
      { seatIndex: 2, amount: 33 },
    ]);
  });

  it("hands out one chip at a time when the pot is smaller than the field", () => {
    assert.deepEqual(splitAward(2, [1, 2, 3], 0, 4), [
      { seatIndex: 1, amount: 1 },
      { seatIndex: 2, amount: 1 },
      { seatIndex: 3, amount: 0 },
    ]);
  });

  it("splits nothing among nobody", () => {
    assert.deepEqual(splitAward(100, [], 0, 4), []);
  });
});

describe("resolvePayout", () => {
  it("awards a single pot to the top-ranked eligible seat and conserves the chips", () => {
    const seats = [seat("hero", 200), seat("ellis", 200)];
    const { payout, seats: settled } = resolvePayout({
      seats,
      judged: [judged("hero", 0, 90), judged("ellis", 1, 60)],
      dealerSeat: 0,
      handSeed: 20260919,
    });

    assert.equal(payout.pots.length, 1);
    assert.equal(payout.pots[0]?.amount, 400);
    assert.deepEqual(payout.pots[0]?.winners, ["hero"]);
    assert.deepEqual(
      payout.pots[0]?.eligible,
      ["hero", "ellis"],
    );
    assert.ok(payout.pots[0]?.ranking !== null);

    assert.equal(settled[0]?.stack, 1_200);
    assert.equal(settled[1]?.stack, 800);
    assert.deepEqual(payout.stackDeltas, [
      { playerId: "hero", start: 1_000, end: 1_200 },
      { playerId: "ellis", start: 1_000, end: 800 },
    ]);
  });

  it("gives a short all-in winner only the pots it is eligible for, and the rest to the next seat", () => {
    const seats = [seat("hero", 500), seat("ellis", 1_000), seat("jay", 1_000)];
    const { payout, seats: settled } = resolvePayout({
      seats,
      judged: [judged("hero", 0, 90), judged("ellis", 1, 60), judged("jay", 2, 30)],
      dealerSeat: 0,
      handSeed: 20260919,
    });

    assert.equal(payout.pots.length, 2);
    assert.deepEqual(payout.pots[0]?.winners, ["hero"]);
    assert.deepEqual(payout.pots[1]?.winners, ["ellis"]);

    // hero takes the 1,500 main pot; the 1,000 side pot is ellis's, because hero never
    // reached it. hero sat down with 1,000 and left with 2,000 — the main pot less its own
    // 500 commitment.
    assert.equal(settled[0]?.stack, 2_000);
    assert.equal(settled[1]?.stack, 1_000);
    assert.equal(settled[2]?.stack, 0);

    const net = payout.stackDeltas.reduce((total, delta) => total + (delta.end - delta.start), 0);
    assert.equal(net, 0);
  });

  it("ranks a layer with one eligible seat without a contest", () => {
    const seats = [seat("hero", 500, { folded: true }), seat("ellis", 1_000)];
    const { payout, seats: settled } = resolvePayout({
      seats,
      judged: [judged("ellis", 1, 40)],
      dealerSeat: 0,
      handSeed: 20260919,
    });

    assert.deepEqual(payout.pots.map((pot) => pot.amount), [1_000, 500]);
    assert.deepEqual(payout.pots.map((pot) => pot.winners), [["ellis"], ["ellis"]]);
    assert.equal(settled[1]?.stack, 1_500);
    assert.equal(payout.stackDeltas.find((delta) => delta.playerId === "hero")?.end, 500);
  });

  it("settles a fold-out without a ladder, ranking nothing", () => {
    const seats = [seat("hero", 200, { folded: true }), seat("ellis", 400)];
    const { payout, seats: settled } = resolvePayout({
      seats,
      judged: [],
      dealerSeat: 0,
      handSeed: 20260919,
    });

    // One layer per commitment level (§25); every layer is ellis's, with no ladder behind it.
    assert.deepEqual(payout.pots.map((pot) => pot.amount), [400, 200]);
    assert.deepEqual(payout.pots.map((pot) => pot.winners), [["ellis"], ["ellis"]]);
    assert.ok(payout.pots.every((pot) => pot.ranking === null));
    assert.equal(settled[1]?.stack, 1_200);
    assert.equal(settled[0]?.stack, 800);
  });

  it("leaves the seats it was handed untouched", () => {
    const seats = [seat("hero", 200), seat("ellis", 200)];
    const before = structuredClone(seats);

    resolvePayout({
      seats,
      judged: [judged("hero", 0, 90), judged("ellis", 1, 60)],
      dealerSeat: 0,
      handSeed: 20260919,
    });

    assert.deepEqual(seats, before);
  });

  it("pays the same hand the same way for the same seed", () => {
    const options = {
      seats: [seat("hero", 500), seat("ellis", 1_000), seat("jay", 1_000)],
      judged: [judged("hero", 0, 0), judged("ellis", 1, 0), judged("jay", 2, 0)],
      dealerSeat: 1,
      handSeed: 4242,
    };

    assert.deepEqual(resolvePayout(options), resolvePayout(options));
  });

  it("gives both layers to one seat when the same tied seats contest them (§21.3, §25)", () => {
    // A folded seat's ten chips merge into the layer above them, so both layers here are
    // contested by the same two seats — and both tied on nothing. §21.3's draw belongs to the
    // tied seats and their words, not to the pot: were each layer seeded its own draw, two
    // identical hands could split the main pot and the side pot between them.
    const { payout } = resolvePayout({
      seats: [seat("hero", 10, { folded: true }), seat("ellis", 1_000), seat("jay", 1_000)],
      judged: [judged("ellis", 1, 0), judged("jay", 2, 0)],
      dealerSeat: 0,
      handSeed: 20260919,
    });

    assert.deepEqual(payout.pots.map((pot) => pot.eligible), [
      ["ellis", "jay"],
      ["ellis", "jay"],
    ]);
    const winners = payout.pots.map((pot) => pot.winners);
    assert.deepEqual(winners[1], winners[0], "one draw settles every layer the group contests");
    assert.equal(winners[0]?.length, 1);

    // The winner takes both layers, the loser keeps nothing, and the folded blind stays lost.
    assert.deepEqual(payout.stackDeltas.map((delta) => delta.end).sort((a, b) => a - b), [
      0, 990, 2_010,
    ]);
  });
});

describe("buildLivePots — pots while betting is open", () => {
  it("keeps unmatched blinds in one pot", () => {
    const pots = buildLivePots([seat("a", 10), seat("b", 20), seat("c", 20)]);
    assert.deepEqual(pots, [{ amount: 50, eligible: [0, 1, 2] }]);
  });

  it("splits only at an all-in: Alex all-in for 30, Bree and Cam in for 100", () => {
    const pots = buildLivePots([
      seat("alex", 30, { allIn: true }),
      seat("bree", 100),
      seat("cam", 100),
    ]);
    assert.deepEqual(pots, [
      { amount: 90, eligible: [0, 1, 2] },
      { amount: 140, eligible: [1, 2] },
    ]);
  });

  it("is empty before any chip is in", () => {
    assert.deepEqual(buildLivePots([seat("a", 0), seat("b", 0)]), []);
  });
});
