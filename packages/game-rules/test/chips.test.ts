import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { awardChips, commitChips, type ChipSeat } from "../src/chips";

const SEAT: ChipSeat = { stack: 1_000, committedRound: 0, committedHand: 0 };

describe("commitChips", () => {
  it("moves the exact amount from the stack into both commit counters", () => {
    const { seat, committed, wentAllIn } = commitChips(SEAT, 20);

    assert.equal(committed, 20);
    assert.equal(seat.stack, 980);
    assert.equal(seat.committedRound, 20);
    assert.equal(seat.committedHand, 20);
    assert.ok(!wentAllIn);
  });

  it("adds to what the seat already committed", () => {
    const midHand: ChipSeat = { stack: 700, committedRound: 100, committedHand: 300 };
    const { seat } = commitChips(midHand, 150);

    assert.equal(seat.stack, 550);
    assert.equal(seat.committedRound, 250);
    assert.equal(seat.committedHand, 450);
  });

  it("caps a commit at the stack and reports the seat all in", () => {
    const short: ChipSeat = { stack: 30, committedRound: 0, committedHand: 40 };
    const { seat, committed, wentAllIn } = commitChips(short, 100);

    assert.equal(committed, 30);
    assert.equal(seat.stack, 0);
    assert.equal(seat.committedRound, 30);
    assert.equal(seat.committedHand, 70);
    assert.ok(wentAllIn);
  });

  it("treats a zero or negative amount as a no-op", () => {
    for (const amount of [0, -5]) {
      const { seat, committed, wentAllIn } = commitChips(SEAT, amount);

      assert.equal(committed, 0);
      assert.deepEqual(seat, SEAT);
      assert.ok(!wentAllIn, `expected a ${amount} commit not to go all in`);
    }
  });

  it("never mutates the seat it was handed", () => {
    const seat: ChipSeat = { stack: 500, committedRound: 10, committedHand: 10 };

    commitChips(seat, 100);

    assert.deepEqual(seat, { stack: 500, committedRound: 10, committedHand: 10 });
  });
});

describe("awardChips", () => {
  it("adds winnings to the stack, uncapped", () => {
    const won = awardChips(SEAT, 4_000);

    assert.equal(won.stack, 5_000);
    assert.ok(won.stack > SEAT.stack);
  });

  it("leaves the commitment counters alone", () => {
    const midHand: ChipSeat = { stack: 0, committedRound: 500, committedHand: 1_000 };
    const won = awardChips(midHand, 1_500);

    assert.equal(won.stack, 1_500);
    assert.equal(won.committedRound, 500);
    assert.equal(won.committedHand, 1_000);
  });

  it("never mutates the seat it was handed", () => {
    const seat: ChipSeat = { stack: 100, committedRound: 0, committedHand: 900 };

    awardChips(seat, 900);

    assert.deepEqual(seat, { stack: 100, committedRound: 0, committedHand: 900 });
  });
});
