import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROUND_PHASES } from "@wordpoker/contracts";

import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER } from "../src/deal";
import {
  OFFLINE_TURN_MS,
  OfflineActionError,
  reduce,
  revealedCount,
  startHand,
  type OfflineState,
} from "../src/offline";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const SEED = 20260919;
const NOW = 1_000_000;

function dealHand(nowMs = NOW): OfflineState {
  return startHand({ seed: SEED, players: SEATS, nowMs });
}

/** Passes `turns` turns, one seat at a time, each a millisecond after the last. */
function passTurns(state: OfflineState, turns: number, fromMs = NOW): OfflineState {
  let next = state;
  for (let turn = 0; turn < turns; turn += 1) {
    next = reduce(next, { type: "advance" }, fromMs + turn);
  }
  return next;
}

/** What the streets reveal, in order: the contract the whole slice hangs off. */
const REVEALS = [
  { phase: "preflop", revealed: 0 },
  { phase: "flop", revealed: 3 },
  { phase: "turn", revealed: 4 },
  { phase: "river", revealed: 5 },
  { phase: "payout", revealed: 5 },
] as const;

/** Every seat acts once on each street before it rolls, so a hand is `seats × streets` passes. */
const TURNS_TO_PAYOUT = SEATS.length * (REVEALS.length - 1);

describe("startHand", () => {
  it("deals two private tiles per seat and the whole five-tile board", () => {
    const state = dealHand();

    assert.equal(state.hand, 1);
    assert.equal(state.seed, SEED);
    assert.equal(state.phase, "preflop");
    assert.equal(state.seats.length, SEATS.length);
    for (const seat of state.seats) {
      assert.equal(seat.privateTiles.length, PRIVATE_TILES_PER_PLAYER);
    }
    assert.equal(state.community.length, COMMUNITY_TILE_COUNT);
    assert.equal(state.revealed, 0);
    assert.equal(state.toActIndex, 0);
  });

  it("arms the first turn's deadline from the injected clock", () => {
    assert.equal(dealHand(NOW).endsAtMs, NOW + OFFLINE_TURN_MS);
  });

  it("deals every tile once across the table", () => {
    const state = dealHand();
    const ids = [
      ...state.seats.flatMap((seat) => seat.privateTiles.map((tile) => tile.id)),
      ...state.community.map((tile) => tile.id),
    ];

    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, SEATS.length * PRIVATE_TILES_PER_PLAYER + COMMUNITY_TILE_COUNT);
  });

  it("replays the same hand for the same seed", () => {
    assert.deepEqual(dealHand(), dealHand());
    assert.notDeepEqual(dealHand(), startHand({ seed: SEED + 1, players: SEATS, nowMs: NOW }));
  });

  it("seats the players in the order it was given", () => {
    assert.deepEqual(
      dealHand().seats.map((seat) => seat.id),
      [...SEATS],
    );
  });
});

describe("reduce — turn order", () => {
  it("passes the turn seat by seat", () => {
    const state = dealHand();

    assert.equal(state.toActIndex, 0);
    assert.equal(passTurns(state, 1).toActIndex, 1);
    assert.equal(passTurns(state, SEATS.length - 1).toActIndex, SEATS.length - 1);
  });

  it("rolls the street once the last seat has passed", () => {
    const afterFullRound = passTurns(dealHand(), SEATS.length);

    assert.equal(afterFullRound.phase, "flop");
    assert.equal(afterFullRound.toActIndex, 0);
    assert.equal(afterFullRound.revealed, 3);
  });

  it("re-arms the deadline from the clock the action carried", () => {
    const state = reduce(dealHand(), { type: "advance" }, NOW + 5_000);

    assert.equal(state.endsAtMs, NOW + 5_000 + OFFLINE_TURN_MS);
  });
});

describe("reduce — streets", () => {
  it("walks preflop to payout revealing 0/3/4/5", () => {
    let state = dealHand();

    for (const { phase, revealed } of REVEALS) {
      assert.equal(state.phase, phase);
      assert.equal(state.revealed, revealed);
      assert.equal(state.revealed, revealedCount(phase));

      if (phase !== "payout") {
        // Every seat acts once per street, and the last pass rolls it.
        state = passTurns(state, SEATS.length, NOW);
      }
    }
  });

  it("has nobody to act once the hand has paid out", () => {
    const payout = passTurns(dealHand(), TURNS_TO_PAYOUT);

    assert.equal(payout.phase, "payout");
    assert.equal(payout.toActIndex, null);
    assert.equal(payout.revealed, 5);
  });

  it("keeps the whole board down until the flop", () => {
    const preflop = dealHand();
    const flop = passTurns(preflop, SEATS.length);

    assert.deepEqual(preflop.community, flop.community);
    assert.equal(preflop.community.length, 5);
  });

  it("names the streets in the order the contract declares them", () => {
    assert.deepEqual(
      REVEALS.map((entry) => entry.phase),
      [...ROUND_PHASES],
    );
  });
});

describe("reduce — rollover", () => {
  const payout = passTurns(dealHand(), TURNS_TO_PAYOUT);

  it("deals a fresh hand past payout, on a seed derived from the last one", () => {
    const next = reduce(payout, { type: "deal" }, NOW);

    assert.equal(next.hand, 2);
    assert.equal(next.seed, payout.seed + payout.hand);
    assert.equal(next.phase, "preflop");
    assert.equal(next.revealed, 0);
    assert.equal(next.toActIndex, 0);
    assert.equal(next.endsAtMs, NOW + OFFLINE_TURN_MS);
    assert.notDeepEqual(
      next.seats.map((seat) => seat.privateTiles),
      payout.seats.map((seat) => seat.privateTiles),
    );
  });

  it("rolls the same fresh hand whether it is told to deal or to advance", () => {
    assert.deepEqual(reduce(payout, { type: "deal" }, NOW), reduce(payout, { type: "advance" }, NOW));
  });

  it("keeps replaying the run from the first seed", () => {
    const next = reduce(payout, { type: "deal" }, NOW);

    assert.deepEqual(next, reduce(passTurns(dealHand(), TURNS_TO_PAYOUT), { type: "deal" }, NOW));
  });
});

describe("reduce — illegal actions", () => {
  it("refuses a deal while the hand is still being played", () => {
    for (const turns of [0, 1, SEATS.length, SEATS.length * 2]) {
      const state = passTurns(dealHand(), turns);

      assert.throws(
        () => reduce(state, { type: "deal" }, NOW),
        (error: unknown) =>
          error instanceof OfflineActionError &&
          error.name === "OfflineActionError" &&
          error.message.includes(state.phase),
        `expected a refusal at ${state.phase}`,
      );
    }
  });

  it("never mutates the state it was handed", () => {
    const state = dealHand();
    const before = structuredClone(state);

    reduce(state, { type: "advance" }, NOW + 1);

    assert.deepEqual(state, before);
  });
});
