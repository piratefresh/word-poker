import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BettingAction, PlayerId, Tile } from "@wordpoker/contracts";

import { DEFAULT_EQUITY_MODEL, estimateBotEquity, sampleWorld } from "../src/equity";
import { observeTable } from "../src/observation";
import { reduce, startHand, type OfflineState } from "../src/offline";
import { createRng } from "../src/rng";
import { TWO_LETTER_TILE_LIMIT } from "../src/special-tiles";
import { TEST_DICTIONARY } from "./fixtures";

const NOW = 1_000_000;

function deal(
  seed = 4242,
  players: readonly string[] = ["hero", "ellis", "jay", "mira"],
  stacks?: readonly { playerId: PlayerId; stack: number }[],
): OfflineState {
  return startHand({
    seed,
    players,
    nowMs: NOW,
    dictionary: TEST_DICTIONARY,
    ...(stacks === undefined ? {} : { stacks }),
  });
}

/** The seat on the clock. */
function acting(state: OfflineState): { index: number; id: PlayerId } {
  const index = state.toActIndex;
  assert.ok(index !== null, "a seat is to act");
  const seat = state.seats[index];
  assert.ok(seat, `seat ${index}`);
  return { index, id: seat.id };
}

/** Observes whoever is on the clock. */
function observe(state: OfflineState): ReturnType<typeof observeTable> {
  return observeTable(state, acting(state).id);
}

/** Applies an action for the seat the caller names, so a test drives the exact line it means. */
function act(state: OfflineState, playerId: PlayerId, action: BettingAction): OfflineState {
  const onTheClock = acting(state);
  assert.equal(onTheClock.id, playerId, `${playerId} is to act`);
  return reduce(state, action, NOW);
}

describe("estimateBotEquity — the numbers a betting decision is made on", () => {
  it("returns the same estimate for the same table, and every layer pays what it holds", () => {
    const state = deal();
    const observation = observe(state);
    const equity = estimateBotEquity({ observation, dictionary: TEST_DICTIONARY });

    assert.deepEqual(
      equity,
      estimateBotEquity({ observation, dictionary: TEST_DICTIONARY }),
      "the same table is the same estimate",
    );

    assert.ok(equity.equity >= 0 && equity.equity <= 1, `equity ${equity.equity} is a share`);
    assert.equal(equity.samples, DEFAULT_EQUITY_MODEL.samples);
    assert.equal(equity.diagnostics.contenders, observation.seats.length);
    assert.ok(equity.diagnostics.wordless <= equity.samples);
    assert.ok(equity.expectedPayout >= 0);

    // Every layer's expectation is the layer's own, and the payout is their sum: the number a
    // call is priced against is not a share of pots that were never layered.
    const summed = equity.pots.reduce((total, pot) => total + pot.expected, 0);
    assert.ok(Math.abs(summed - equity.expectedPayout) < 1e-9, "the payout is the layers summed");
    for (const pot of equity.pots) {
      assert.ok(pot.expected <= pot.amount + 1e-9, "a layer never pays more than it holds");
    }
  });

  it("refuses a model that does not ask for a whole number of worlds", () => {
    const observation = observe(deal());

    for (const samples of [0, -1, 1.5]) {
      assert.throws(
        () => estimateBotEquity({ observation, dictionary: TEST_DICTIONARY, model: { samples } }),
        RangeError,
      );
    }
  });

  it("counts a seat's own commitment into the pots a call would put it in", () => {
    // §25 layers the pots by what each seat has committed, so a seat deciding whether to pay
    // for a pot has to be priced against the pot its chips would be in. `short` shoves its 100,
    // `raiser` raises to 400, and `caller` owes 400: before it pays, it is eligible for neither
    // layer — its chips are not in either pot yet.
    const stacks = [
      { playerId: "short", stack: 100 },
      { playerId: "raiser", stack: 1_000 },
      { playerId: "caller", stack: 1_000 },
    ];
    let state = deal(4242, ["short", "raiser", "caller"], stacks);

    state = act(state, "raiser", { type: "check", playerId: "raiser" });
    state = act(state, "caller", { type: "check", playerId: "caller" });
    state = act(state, "short", { type: "allIn", playerId: "short" });
    state = act(state, "raiser", { type: "raise", playerId: "raiser", amount: 400 });

    const observation = observe(state);
    assert.equal(observation.playerId, "caller");
    assert.equal(observation.toCall, 400);
    assert.equal(observation.callCost, 400);

    const before = estimateBotEquity({ observation, dictionary: TEST_DICTIONARY });
    const after = estimateBotEquity({ observation, dictionary: TEST_DICTIONARY, commit: 400 });

    assert.equal(before.pots.length, 2, "the shove and the raise layer the pot in two");
    assert.deepEqual(
      before.pots.map((pot) => pot.eligible),
      [false, false],
      "nothing committed yet, so nothing to win",
    );
    assert.deepEqual(
      after.pots.map((pot) => pot.eligible),
      [true, true],
      "paying the 400 reaches both layers",
    );
    assert.equal(before.expectedPayout, 0, "a seat that cannot win a pot expects nothing from it");
    assert.ok(after.expectedPayout > 0, "the same hand expects something once it is eligible");

    // What the seat wins does not depend on what it pays: the call buys eligibility, not odds.
    assert.equal(after.equity, before.equity);
    // The call's chips are in the pots — spread over the layers its commitment reaches, which
    // is what §25's levels mean, so the layers grow by the call between them and not one each.
    const held = (pots: readonly { amount: number }[]): number =>
      pots.reduce((total, pot) => total + pot.amount, 0);
    assert.equal(held(after.pots), held(before.pots) + 400);
    assert.deepEqual(
      after.pots.map((pot) => pot.amount),
      [300, 600],
      "100 into the layer the shove reached, 300 into the one above it",
    );
  });
});

describe("sampleWorld — the worlds the estimate averages over", () => {
  it("never deals a tile twice, and keeps the seat's own rack a fact", () => {
    const state = deal();
    const observation = observe(state);
    const rng = createRng(11);

    for (let world = 0; world < 8; world += 1) {
      const sampled = sampleWorld(observation, DEFAULT_EQUITY_MODEL, rng);
      // The whole table as the world deals it: every rack, and the board entire.
      const ids = [...sampled.racks.flat(), ...sampled.board].map((tile) => tile.id);

      assert.equal(new Set(ids).size, ids.length, "no tile appears twice in one world");
      assert.deepEqual(
        sampled.racks[observation.seat],
        state.seats[observation.seat]?.privateTiles,
        "the seat's own tiles are the ones the deal gave it",
      );
      assert.deepEqual(
        sampled.board.slice(0, observation.board.length),
        observation.board,
        "the streets the seat has seen are the tiles the world shows",
      );
    }
  });

  it("shows no tile the seat is already holding", () => {
    const state = deal(9001);
    const observation = observe(state);
    const rng = createRng(5);
    const held = new Set([...observation.privateTiles, ...observation.board].map((tile) => tile.id));

    for (let world = 0; world < 8; world += 1) {
      const sampled = sampleWorld(observation, DEFAULT_EQUITY_MODEL, rng);

      for (const seat of observation.seats) {
        if (seat.seat === observation.seat) continue;
        for (const tile of sampled.racks[seat.seat] ?? []) {
          assert.ok(!held.has(tile.id), `${tile.id} is already on the felt`);
        }
      }
      for (const tile of sampled.board.slice(observation.board.length)) {
        assert.ok(!held.has(tile.id), `${tile.id} is already on the felt`);
      }
    }
  });

  it("deals every seat the deal's own rack size, on a board five tiles deep", () => {
    const state = deal(9001);
    const observation = observe(state);
    const rng = createRng(5);

    for (let world = 0; world < 8; world += 1) {
      const sampled = sampleWorld(observation, DEFAULT_EQUITY_MODEL, rng);

      assert.equal(sampled.racks.length, observation.seats.length);
      for (const rack of sampled.racks) {
        assert.equal(rack.length, 2, "a seat is dealt two private tiles");
      }
      assert.equal(sampled.board.length, 5, "the board is five tiles");
    }
  });

  it("holds §10's cap on two-letter tiles across the whole hand", () => {
    const state = deal(777);
    const observation = observe(state);
    const rng = createRng(1);
    const twoLetter = (tile: Tile): boolean =>
      "alternativeLetter" in tile || "sequenceLetter" in tile;

    for (let world = 0; world < 8; world += 1) {
      const sampled = sampleWorld(observation, DEFAULT_EQUITY_MODEL, rng);
      const held = [...sampled.racks.flat(), ...sampled.board].filter(twoLetter);

      assert.ok(
        held.length <= TWO_LETTER_TILE_LIMIT,
        `a hand holds at most ${TWO_LETTER_TILE_LIMIT} two-letter tiles, this one held ${held.length}`,
      );
    }
  });

  it("rolls §9's multipliers onto the tiles it turns over", () => {
    // Not a claim about any one tile: over enough worlds the band has to land somewhere, and a
    // model that never rolled one would hand every rival a rack the deal does not deal.
    const state = deal(31337);
    const observation = observe(state);
    const rng = createRng(9);
    let multiplied = 0;

    for (let world = 0; world < 60; world += 1) {
      const sampled = sampleWorld(observation, DEFAULT_EQUITY_MODEL, rng);
      multiplied += sampled.board.slice(observation.board.length).filter((tile) => tile.multiplier !== undefined).length;
    }

    assert.ok(multiplied > 0, "some face-down tile carried a multiplier");
  });

  it("rolls §10's two-letter tiles into the worlds at all", () => {
    // The deal places fixed-sequence tiles, and they are not bag members: a model that sampled
    // the printed bag alone could never put one in a rival's rack, and would price every rival
    // slightly weaker than the deal does. Over a full hand's worth of worlds some must appear.
    const state = deal(4242);
    const observation = observe(state);
    const rng = createRng(17);
    let placed = 0;

    for (let world = 0; world < 40; world += 1) {
      const sampled = sampleWorld(observation, DEFAULT_EQUITY_MODEL, rng);
      placed += [...sampled.racks.flat(), ...sampled.board].filter((tile) => "sequenceLetter" in tile).length;
    }

    assert.ok(placed > 0, "the model places §10's sequence tiles");
  });
});
