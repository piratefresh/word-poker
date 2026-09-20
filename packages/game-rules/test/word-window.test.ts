import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Tile, TilePlay, WordSubmission } from "@wordpoker/contracts";

import {
  BettingRejectionError,
  OfflineActionError,
  reduce,
  startHand,
  WORD_WINDOW_MS,
  WordRejectionError,
  type OfflineState,
  type WordSlot,
} from "../src/offline";
import { TEST_DICTIONARY, cloneState } from "./fixtures";

const SEATS = ["hero", "ellis", "jay", "mira"] as const;
const SEED = 20260919;
const NOW = 1_000_000;

/** How many actions a checked hand takes to reach the river's close: four streets, every seat. */
const CHECKS_TO_RIVER_END = SEATS.length * 4;

/** Checks every seat through every street: §19's window opens on the river's last check. */
function checkAround(state: OfflineState, fromMs = NOW): OfflineState {
  let next = state;
  let step = 0;

  while (next.wordWindow?.status !== "open" && next.phase !== "payout") {
    const index = next.toActIndex;
    assert.ok(index !== null, "a seat is to act");
    const seat = next.seats[index];
    assert.ok(seat, `seat ${index}`);
    next = reduce(next, { type: "check", playerId: seat.id }, fromMs + step);
    step += 1;
    assert.ok(step <= CHECKS_TO_RIVER_END, "a checked hand is four streets of checks");
  }

  return next;
}

/**
 * A hand dealt at `nowMs` and walked past its streets to the river's close, where §19's word
 * window opens. `wordBuilding` is the table's §19 configuration.
 */
function atWindow(nowMs = NOW, wordBuilding: { autoSubmitDrafts?: boolean } = {}): OfflineState {
  const dealt = startHand({ seed: SEED, players: SEATS, nowMs, wordBuilding, dictionary: TEST_DICTIONARY });
  return checkAround(dealt, nowMs);
}

/** One tile played: a choice tile must name the face it plays (§10), the others may not. */
function play(tile: Tile): TilePlay {
  return "alternativeLetter" in tile ? { tileId: tile.id, chosenFace: tile.letter } : { tileId: tile.id };
}

/** A submission this seat can build: its first two private tiles, in the order they were dealt. */
function twoTiles(state: OfflineState, seatIndex: number): WordSubmission {
  const seat = state.seats[seatIndex];
  return { plays: (seat?.privateTiles ?? []).slice(0, 2).map(play) };
}

/** One private tile of a seat, for the submissions that play a single letter. */
function firstTile(state: OfflineState, seatIndex: number): Tile {
  const tile = state.seats[seatIndex]?.privateTiles[0];
  assert.ok(tile, `seat ${seatIndex} holds a private tile`);
  return tile;
}

/** A tile of the hand that plays one letter — what a one-letter draft is made of (§10). */
function singleLetterTile(state: OfflineState, seatIndex: number): Tile {
  const found = (state.seats[seatIndex]?.privateTiles ?? []).find(
    (tile) => !("alternativeLetter" in tile) && !("sequenceLetter" in tile),
  );
  assert.ok(found, `seat ${seatIndex} holds a single-letter tile`);
  return found;
}

/** The slot a seat holds in the window; the test names the seat, the slot names itself. */
function slotOf(state: OfflineState, seatIndex: number): WordSlot {
  const slot = (state.wordWindow?.slots ?? []).find((candidate) => candidate.seat === seatIndex);
  assert.ok(slot, `seat ${seatIndex} has a slot in the window`);
  return slot;
}

/** The word a seat confirmed, or `null` when it confirmed none — which §11 scores 0. */
function confirmedWord(state: OfflineState, seatIndex: number): WordSubmission | null {
  const slot = slotOf(state, seatIndex);
  return slot.status === "confirmed" ? slot.submission : null;
}

describe("the word window — §19, between the river and the payout", () => {
  it("opens on the river's last check: a slot per seat, on one shared clock", () => {
    const state = atWindow();

    assert.equal(state.phase, "river");
    assert.equal(state.revealed, 5);
    assert.equal(state.toActIndex, null);
    assert.equal(state.betting, null);
    assert.equal(state.endsAtMs, NOW + CHECKS_TO_RIVER_END - 1 + WORD_WINDOW_MS);
    assert.equal(state.wordWindow?.status, "open");
    assert.deepEqual(
      (state.wordWindow?.slots ?? []).map((slot) => [slot.seat, slot.playerId]),
      [
        [0, "hero"],
        [1, "ellis"],
        [2, "jay"],
        [3, "mira"],
      ],
    );
    assert.ok(
      (state.wordWindow?.slots ?? []).every((slot) => slot.status === "drafting" && slot.draft === null),
      "every seat starts with an empty draft",
    );
  });

  it("lets a seat edit its draft until it confirms, and locks the confirmed word", () => {
    const opened = atWindow();
    const first = twoTiles(opened, 0);

    const drafted = reduce(
      opened,
      { type: "draftWord", playerId: "hero", submission: first },
      opened.endsAtMs - 2,
    );
    const draftedSlot = slotOf(drafted, 0);
    assert.equal(draftedSlot.status, "drafting");
    assert.deepEqual(draftedSlot.status === "drafting" ? draftedSlot.draft : null, first);

    const edited: WordSubmission = { plays: [...first.plays].reverse() };
    const confirmed = reduce(
      drafted,
      { type: "confirmWord", playerId: "hero", submission: edited },
      opened.endsAtMs - 1,
    );
    assert.deepEqual(confirmedWord(confirmed, 0), edited);

    assert.throws(
      () =>
        reduce(
          confirmed,
          { type: "confirmWord", playerId: "hero", submission: first },
          opened.endsAtMs - 1,
        ),
      OfflineActionError,
    );
    assert.deepEqual(confirmedWord(confirmed, 0), edited);
  });

  it("refuses a word the seat cannot build, with §11's reason", () => {
    const opened = atWindow();

    assert.throws(
      () =>
        reduce(
          opened,
          { type: "confirmWord", playerId: "hero", submission: { plays: [{ tileId: "ZZ-9" }] } },
          opened.endsAtMs - 1,
        ),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "uses-unavailable-letters",
    );

    assert.throws(
      () =>
        reduce(
          opened,
          { type: "confirmWord", playerId: "hero", submission: { plays: [play(firstTile(opened, 0))] } },
          opened.endsAtMs - 1,
        ),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "too-short",
    );
  });

  it("accepts a word a millisecond before the deadline, and refuses one at it as timer-expired", () => {
    const opened = atWindow();
    const submission = twoTiles(opened, 0);

    const justInTime = reduce(
      opened,
      { type: "confirmWord", playerId: "hero", submission },
      opened.endsAtMs - 1,
    );
    assert.deepEqual(confirmedWord(justInTime, 0), submission);

    assert.throws(
      () => reduce(opened, { type: "confirmWord", playerId: "hero", submission }, opened.endsAtMs),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "timer-expired",
    );
  });

  it("pays out only once every seat has confirmed or run out of time", () => {
    const opened = atWindow();
    const hero = reduce(
      opened,
      { type: "confirmWord", playerId: "hero", submission: twoTiles(opened, 0) },
      opened.endsAtMs - 1,
    );

    // The hero is done, and the table is not: the other seats still have the clock.
    assert.equal(hero.phase, "river");
    assert.equal(hero.wordWindow?.status, "open");

    const payout = reduce(hero, { type: "timeoutWords" }, hero.endsAtMs);

    assert.equal(payout.phase, "payout");
    assert.equal(payout.toActIndex, null);
    assert.deepEqual(confirmedWord(payout, 0), twoTiles(opened, 0));
    assert.ok(
      SEATS.slice(1).every((_, offset) => slotOf(payout, offset + 1).status === "timed-out"),
      "every seat that never confirmed is out of time",
    );
  });

  it("closes as soon as every seat has confirmed, without running the clock down", () => {
    let state = atWindow();

    for (const [index, playerId] of SEATS.entries()) {
      state = reduce(
        state,
        { type: "confirmWord", playerId, submission: twoTiles(state, index) },
        state.endsAtMs - 5_000,
      );
    }

    assert.equal(state.phase, "payout");
    assert.equal(state.wordWindow?.status, "settled");
    assert.ok(
      SEATS.every((_, index) => confirmedWord(state, index) !== null),
      "every confirmed word survives the close",
    );
  });

  it("refuses a timeout while the seats still have time, and a second one after the close", () => {
    const opened = atWindow();

    assert.throws(() => reduce(opened, { type: "timeoutWords" }, opened.endsAtMs - 1), OfflineActionError);

    const payout = reduce(opened, { type: "timeoutWords" }, opened.endsAtMs);
    assert.throws(() => reduce(payout, { type: "timeoutWords" }, payout.endsAtMs + 1), OfflineActionError);
  });

  it("refuses a betting action while the window is open, and a word for a seat outside it", () => {
    const opened = atWindow();

    assert.throws(
      () => reduce(opened, { type: "check", playerId: "hero" }, opened.endsAtMs - 1),
      (error: unknown) => error instanceof BettingRejectionError && error.reason === "hand-over",
    );
    assert.throws(
      () =>
        reduce(
          opened,
          { type: "draftWord", playerId: "ghost", submission: twoTiles(opened, 0) },
          opened.endsAtMs - 1,
        ),
      OfflineActionError,
    );
  });

  it("confirms a seat's open draft for it at the deadline only when the table opted in", () => {
    const optedIn = atWindow(NOW, { autoSubmitDrafts: true });
    const drafted = reduce(
      optedIn,
      { type: "draftWord", playerId: "ellis", submission: twoTiles(optedIn, 1) },
      optedIn.endsAtMs - 1,
    );

    assert.deepEqual(
      confirmedWord(reduce(drafted, { type: "timeoutWords" }, drafted.endsAtMs), 1),
      twoTiles(optedIn, 1),
    );

    // The rules' default: the player must confirm, so the draft dies with the clock.
    const byDefault = atWindow();
    const leftOpen = reduce(
      byDefault,
      { type: "draftWord", playerId: "ellis", submission: twoTiles(byDefault, 1) },
      byDefault.endsAtMs - 1,
    );
    const timedOut = reduce(leftOpen, { type: "timeoutWords" }, leftOpen.endsAtMs);

    assert.equal(confirmedWord(timedOut, 1), null);
    assert.equal(slotOf(timedOut, 1).status, "timed-out");
  });

  it("carries the option into the next hand, whose window has not opened yet", () => {
    const optedIn = atWindow(NOW, { autoSubmitDrafts: true });
    const payout = reduce(optedIn, { type: "timeoutWords" }, optedIn.endsAtMs);
    const next = reduce(payout, { type: "deal" }, NOW);

    assert.equal(next.wordWindow, null);
    assert.equal(next.autoSubmitDrafts, true);
  });

  it("takes a one-letter draft, because §12's floor is about the word a seat stands behind", () => {
    const state = atWindow();
    const one: WordSubmission = { plays: [play(singleLetterTile(state, 0))] };

    const drafted = reduce(state, { type: "draftWord", playerId: "hero", submission: one }, NOW);
    assert.deepEqual(slotOf(drafted, 0), { seat: 0, playerId: "hero", status: "drafting", draft: one });

    // The floor waits for the confirm, which is the moment the draft becomes the seat's word.
    assert.throws(
      () => reduce(drafted, { type: "confirmWord", playerId: "hero", submission: one }, NOW),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "too-short",
    );
  });

  it("clears the draft when a seat asks for an empty one", () => {
    const state = atWindow();
    const drafted = reduce(state, { type: "draftWord", playerId: "hero", submission: twoTiles(state, 0) }, NOW);

    const cleared = reduce(drafted, { type: "draftWord", playerId: "hero", submission: { plays: [] } }, NOW);

    assert.deepEqual(slotOf(cleared, 0), { seat: 0, playerId: "hero", status: "drafting", draft: null });
  });

  it("never mutates the state it was handed", () => {
    const opened = atWindow();
    const before = cloneState(opened);

    reduce(opened, { type: "confirmWord", playerId: "hero", submission: twoTiles(opened, 0) }, opened.endsAtMs - 1);
    reduce(opened, { type: "timeoutWords" }, opened.endsAtMs);

    assert.deepEqual(opened, before);
  });
});
