import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile } from "@wordpoker/contracts";

import { BOT_STREAMS, decisionSeed, observeTable } from "../src/observation";
import { OfflineActionError, reduce, revealedCount, startHand, type OfflineState } from "../src/offline";
import { TEST_DICTIONARY } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const NOW = 1_000_000;

function deal(seed = 4242): OfflineState {
  return startHand({ seed, players: SEATS, nowMs: NOW, dictionary: TEST_DICTIONARY });
}

/** The seat on the clock. */
function actingSeat(state: OfflineState): number {
  const index = state.toActIndex;
  assert.ok(index !== null, "a seat is to act");
  return index;
}

/** Checks every seat around until the street rolls (or the window opens). */
function checkAround(state: OfflineState, streets = 1): OfflineState {
  let next = state;
  let rolls = 0;

  for (let step = 0; step < 40; step += 1) {
    if (next.toActIndex === null) break;
    const before = next.phase;
    next = reduce(next, { type: "check", playerId: next.seats[actingSeat(next)]?.id ?? "" }, NOW);
    if (next.phase === "payout" || next.wordWindow?.status === "open") break;
    if (next.phase !== before && ++rolls >= streets) break;
  }

  return next;
}

/** A stand-in tile no deal can produce, so a leak is unmistakable in a value. */
function planted(id: string): Tile {
  return { id, letter: "Q", points: 10 };
}

/**
 * The same table with every tile a seat cannot see replaced by planted ones: the other seats'
 * racks, and the community tiles the streets have not turned over. What a seat may know is
 * exactly what this must leave alone.
 */
function withHiddenTilesReplaced(state: OfflineState): OfflineState {
  return {
    ...state,
    community: state.community.map((tile, index) =>
      index < state.revealed ? tile : planted(`hidden-board-${index}`),
    ),
    seats: state.seats.map((seat, index) =>
      index === state.toActIndex
        ? seat
        : { ...seat, privateTiles: seat.privateTiles.map((_, copy) => planted(`hidden-rack-${index}-${copy}`)) },
    ),
  };
}

describe("observeTable — what a seat is allowed to know", () => {
  it("hands back the seat's own tiles and no others", () => {
    const state = deal();
    const seat = actingSeat(state);
    const observation = observeTable(state, state.seats[seat]?.id ?? "");

    assert.equal(observation.seat, seat);
    assert.deepEqual(observation.available, state.seats[seat]?.privateTiles);
    assert.equal(observation.privateTiles.length, 2);

    // Every other seat's tiles are in the state and must appear nowhere in what it sees.
    const seen = new Set(observation.available.map((tile) => tile.id));
    for (let index = 0; index < state.seats.length; index += 1) {
      if (index === seat) continue;
      for (const tile of state.seats[index]?.privateTiles ?? []) {
        assert.ok(!seen.has(tile.id), `seat ${index}'s ${tile.id} is not what seat ${seat} sees`);
      }
    }
  });

  it("shows only the board the streets have turned over", () => {
    let state = deal();

    for (const street of [0, 1, 2, 3] as const) {
      const observation = observeTable(state, state.seats[actingSeat(state)]?.id ?? "");
      const shown = revealedCount(state.phase);

      assert.equal(state.community.length, 5, "the deal holds the whole board");
      assert.equal(observation.board.length, shown, `${state.phase} shows ${shown} tiles`);
      assert.deepEqual(observation.board, state.community.slice(0, shown));

      const seen = new Set([observation.privateTiles, observation.board].flat().map((tile) => tile.id));
      for (const tile of state.community.slice(state.revealed)) {
        assert.ok(!seen.has(tile.id), `the face-down ${tile.id} is not in what the seat sees`);
      }

      if (street < 3) state = checkAround(state);
    }
  });

  it("reads the same table the same way whatever is face down", () => {
    // The invariant STO-361 turns on: a bot's knowledge is a function of the public table and
    // its own tiles, so nothing it decides can move when the deal behind it does. Two seats
    // and two streets, because a leak usually hides on one of them and not the others.
    for (const seed of [4242, 4243]) {
      for (const streets of [0, 1, 2, 3]) {
        const state = checkAround(deal(seed), streets);
        if (state.toActIndex === null) continue;

        const id = state.seats[actingSeat(state)]?.id ?? "";
        const before = observeTable(state, id);
        const after = observeTable(withHiddenTilesReplaced(state), id);

        assert.deepEqual(after, before, `seed ${seed}, ${streets} street(s): the observation matched`);
      }
    }
  });

  it("refuses a seat that is not on the clock, and a table with no turn", () => {
    const state = deal();
    const acting = state.seats[actingSeat(state)]?.id ?? "";

    for (const seat of state.seats) {
      if (seat.id === acting) continue;
      assert.throws(
        () => observeTable(state, seat.id),
        (error: unknown) => error instanceof OfflineActionError,
        `${seat.id} is not to act`,
      );
    }

    assert.throws(
      () => observeTable(state, "ghost"),
      (error: unknown) => error instanceof OfflineActionError,
    );
  });
});

describe("decisionSeed — the streams one decision draws from", () => {
  const seats = (state: OfflineState): readonly string[] =>
    state.seats.map((seat) => seat.id);

  it("names the same stream for the same decision, and a different one per purpose", () => {
    const state = deal();
    const id = seats(state)[actingSeat(state)] ?? "";
    const observation = observeTable(state, id);

    for (const stream of BOT_STREAMS) {
      assert.equal(decisionSeed(observation, stream), decisionSeed(observation, stream));
    }

    const seeds = BOT_STREAMS.map((stream) => decisionSeed(observation, stream));
    assert.equal(new Set(seeds).size, BOT_STREAMS.length, "no two purposes share a stream");
  });

  it("does not move when the tiles behind a seat's knowledge do", () => {
    let state = deal();
    const id = seats(state)[actingSeat(state)] ?? "";
    const before = decisionSeed(observeTable(state, id), "simulation");
    const after = decisionSeed(observeTable(withHiddenTilesReplaced(state), id), "simulation");

    assert.equal(after, before);

    state = checkAround(state, 1);
    const later = decisionSeed(
      observeTable(state, seats(state)[actingSeat(state)] ?? ""),
      "simulation",
    );
    assert.notEqual(later, before, "the next street is a different decision");
  });

  it("names a different stream for every decision point in a street", () => {
    // Checks around one preflop round: one decision each, and no two of them the same stream —
    // a seed that ignored the betting would hand every seat in the round the same numbers.
    let state = deal();
    const seen = new Set<number>();
    let decisions = 0;

    for (let step = 0; step < 6; step += 1) {
      const index = state.toActIndex;
      if (index === null || state.phase !== "preflop") break;
      const id = state.seats[index]?.id ?? "";
      seen.add(decisionSeed(observeTable(state, id), "mixing"));
      decisions += 1;
      state = reduce(state, { type: "check", playerId: id }, NOW);
    }

    assert.equal(decisions, state.seats.length, "one decision per seat in the round");
    assert.equal(seen.size, decisions, "no two decisions in the round shared a stream");
  });

  it("names a different stream once the round has been raised into", () => {
    // The same seat, the same street, the same hand — and a different decision, because the
    // price it faces changed. A stream that ignored the price would roll the same number on
    // every reopening, which is how a seat that once decided to raise raises forever.
    let state = deal();
    const first = state.seats[actingSeat(state)]?.id ?? "";
    const atFirst = decisionSeed(observeTable(state, first), "mixing");

    state = reduce(state, { type: "bet", playerId: first, amount: 20 }, NOW);
    const second = state.seats[actingSeat(state)]?.id ?? "";
    const facing = decisionSeed(observeTable(state, second), "mixing");

    assert.notEqual(facing, atFirst, "the price the seat faces is part of its key");
  });
});
