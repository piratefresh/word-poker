import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OfflineAction, PlayerId, Tile, WordSubmission } from "@wordpoker/contracts";

import { OfflineActionError, WordRejectionError } from "../src/errors";
import {
  WORD_WINDOW_MS,
  applyWord,
  openWindow,
  timeout,
  type WindowSeat,
  type WindowTable,
  type WordSlot,
  type WordWindow,
} from "../src/word-window";

/**
 * §19's window on its own: the module is handed four seats and a clock, and everything below is
 * a literal. No hand is dealt, no street is walked, and the tiles are the ones this file writes
 * down — which is the point of the seam: the window's rules are about slots and the clock, and
 * the only thing it needs from a hand is what a seat holds.
 */

const NOW = 1_000_000;
/** The deadline the whole table shares, as `openWindow` arms it. */
const ENDS_AT = NOW + WORD_WINDOW_MS;

const SEATS: readonly WindowSeat[] = [
  { seat: 0, playerId: "hero" },
  { seat: 1, playerId: "ellis" },
  { seat: 2, playerId: "jay" },
  { seat: 3, playerId: "mira" },
];

/** One seat's tiles: two single letters that spell, and a pair that plays both its faces (§10). */
function tilesOf(seat: number): readonly Tile[] {
  return [
    { id: `s${seat}-a`, letter: "A", points: 1 },
    { id: `s${seat}-r`, letter: "R", points: 2 },
    { id: `s${seat}-th`, letter: "T", points: 1, sequenceLetter: "H", sequencePoints: 4 },
  ];
}

/** The word a seat builds: its own two letters, in the order it plays them. */
function wordOf(seat: number): WordSubmission {
  return { plays: [{ tileId: `s${seat}-a` }, { tileId: `s${seat}-r` }] };
}

type WordAction = Extract<OfflineAction, { type: "draftWord" | "confirmWord" }>;

/** What the module reads for one action: the slots, the shared clock, and each seat's tiles. */
function tableFor(
  window: WordWindow,
  options: { autoSubmitDrafts?: boolean; tilesFor?: (seat: number) => readonly Tile[] } = {},
): WindowTable {
  return {
    slots: window.slots,
    endsAtMs: ENDS_AT,
    autoSubmitDrafts: options.autoSubmitDrafts ?? false,
    tilesFor: options.tilesFor ?? tilesOf,
  };
}

/** An open window and the table it is read through, which every case below starts from. */
function opened(options: { autoSubmitDrafts?: boolean } = {}): {
  window: WordWindow;
  table: WindowTable;
} {
  const { window, endsAtMs } = openWindow(SEATS, NOW);
  assert.equal(endsAtMs, ENDS_AT, "one clock for the whole table");
  return { window, table: tableFor(window, options) };
}

/** One action through the module, with the table the next action reads — what a hand does between them. */
function step(
  from: { window: WordWindow; table: WindowTable },
  action: WordAction,
  nowMs = ENDS_AT - 1,
): { window: WordWindow; table: WindowTable } {
  const window = applyWord(from.table, action, nowMs);
  return { window, table: { ...from.table, slots: window.slots } };
}

/** §19's clock run out. */
function closed(
  from: { window: WordWindow; table: WindowTable },
  nowMs = ENDS_AT,
): { window: WordWindow; table: WindowTable } {
  const window = timeout(from.table, nowMs);
  return { window, table: { ...from.table, slots: window.slots } };
}

/** The slot a seat holds; the test names the seat, the slot names itself. */
function slotOf(window: WordWindow, playerId: PlayerId): WordSlot {
  const slot = window.slots.find((candidate) => candidate.playerId === playerId);
  assert.ok(slot, `${playerId} holds a slot in the window`);
  return slot;
}

/** The word a seat confirmed, or `null` when it confirmed none — which §11 scores 0. */
function confirmed(window: WordWindow, playerId: PlayerId): WordSubmission | null {
  const slot = slotOf(window, playerId);
  return slot.status === "confirmed" ? slot.submission : null;
}

describe("§19's word window", () => {
  it("opens one slot per seat handed in, in seat order, on one clock", () => {
    const { window } = opened();

    assert.equal(window.status, "open");
    assert.deepEqual(
      window.slots.map((slot) => [slot.seat, slot.playerId]),
      [
        [0, "hero"],
        [1, "ellis"],
        [2, "jay"],
        [3, "mira"],
      ],
    );
    assert.ok(
      window.slots.every((slot) => slot.status === "drafting" && slot.draft === null),
      "every seat starts with an empty draft",
    );

    // The caller owns who is in the hand: a seat it leaves out has no slot, and never will.
    const two = openWindow(SEATS.slice(0, 2), NOW);
    assert.deepEqual(
      two.window.slots.map((slot) => slot.playerId),
      ["hero", "ellis"],
    );
  });

  it("lets a seat edit its draft until it confirms, and locks the confirmed word", () => {
    const opened_ = opened();
    const first = wordOf(0);
    const drafted = step(opened_, { type: "draftWord", playerId: "hero", submission: first });

    const draftedSlot = slotOf(drafted.window, "hero");
    assert.equal(draftedSlot.status, "drafting");
    assert.deepEqual(draftedSlot.status === "drafting" ? draftedSlot.draft : null, first);

    const edited: WordSubmission = { plays: [...first.plays].reverse() };
    const confirmed_ = step(drafted, { type: "confirmWord", playerId: "hero", submission: edited });
    assert.deepEqual(confirmed(confirmed_.window, "hero"), edited);

    assert.throws(
      () => step(confirmed_, { type: "confirmWord", playerId: "hero", submission: first }),
      OfflineActionError,
    );
    assert.deepEqual(confirmed(confirmed_.window, "hero"), edited);
  });

  it("clears the draft when a seat asks for an empty one", () => {
    const opened_ = step(opened(), { type: "draftWord", playerId: "hero", submission: wordOf(0) });
    const cleared = step(opened_, { type: "draftWord", playerId: "hero", submission: { plays: [] } });

    assert.deepEqual(slotOf(cleared.window, "hero"), {
      seat: 0,
      playerId: "hero",
      status: "drafting",
      draft: null,
    });
  });

  it("judges a draft against the tiles the caller hands it, and no others", () => {
    const { table } = opened();
    const rackless: WindowTable = { ...table, tilesFor: () => [] };

    assert.throws(
      () => applyWord(rackless, { type: "confirmWord", playerId: "hero", submission: wordOf(0) }, NOW),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "uses-unavailable-letters",
    );
  });

  it("refuses a word the seat cannot build, with §11's reason", () => {
    const { table } = opened();

    assert.throws(
      () =>
        applyWord(
          table,
          { type: "confirmWord", playerId: "hero", submission: { plays: [{ tileId: "ZZ-9" }] } },
          NOW,
        ),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "uses-unavailable-letters",
    );

    assert.throws(
      () =>
        applyWord(
          table,
          { type: "confirmWord", playerId: "hero", submission: { plays: [{ tileId: "s0-a" }] } },
          NOW,
        ),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "too-short",
    );
  });

  it("takes a one-letter draft, because §12's floor is about the word a seat stands behind", () => {
    const opened_ = opened();
    const one: WordSubmission = { plays: [{ tileId: "s0-a" }] };

    const drafted = step(opened_, { type: "draftWord", playerId: "hero", submission: one }, NOW);
    assert.deepEqual(slotOf(drafted.window, "hero"), {
      seat: 0,
      playerId: "hero",
      status: "drafting",
      draft: one,
    });

    // The floor waits for the confirm, which is the moment the draft becomes the seat's word.
    assert.throws(
      () => step(drafted, { type: "confirmWord", playerId: "hero", submission: one }, NOW),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "too-short",
    );
  });

  it("accepts a word a millisecond before the deadline, and refuses one at it as timer-expired", () => {
    const { table } = opened();

    const justInTime = applyWord(
      table,
      { type: "confirmWord", playerId: "hero", submission: wordOf(0) },
      ENDS_AT - 1,
    );
    assert.deepEqual(confirmed(justInTime, "hero"), wordOf(0));

    assert.throws(
      () => applyWord(table, { type: "confirmWord", playerId: "hero", submission: wordOf(0) }, ENDS_AT),
      (error: unknown) => error instanceof WordRejectionError && error.reason === "timer-expired",
    );
  });

  it("refuses a word for a seat the window does not hold, and one from a seat out of time", () => {
    const { table } = opened();

    assert.throws(
      () => applyWord(table, { type: "draftWord", playerId: "ghost", submission: wordOf(0) }, NOW),
      OfflineActionError,
    );

    const selfTimedOut: WindowTable = {
      ...table,
      slots: table.slots.map((slot) =>
        slot.playerId === "hero" ? { seat: slot.seat, playerId: slot.playerId, status: "timed-out" } : slot,
      ),
    };
    assert.throws(
      () => applyWord(selfTimedOut, { type: "draftWord", playerId: "hero", submission: wordOf(0) }, NOW),
      OfflineActionError,
    );
  });

  it("stays open while a seat is still drafting, however many have confirmed", () => {
    let current = opened();
    for (const [index, seat] of SEATS.entries()) {
      if (index === SEATS.length - 1) break;
      current = step(current, { type: "confirmWord", playerId: seat.playerId, submission: wordOf(index) });
    }

    assert.equal(current.window.status, "open");
    assert.equal(slotOf(current.window, "mira").status, "drafting");
  });

  it("closes as soon as every slot has a word on it, without running the clock down", () => {
    let current = opened();
    for (const [index, seat] of SEATS.entries()) {
      current = step(
        current,
        { type: "confirmWord", playerId: seat.playerId, submission: wordOf(index) },
        ENDS_AT - 5_000,
      );
    }

    assert.equal(current.window.status, "settled");
    assert.ok(
      SEATS.every((seat) => confirmed(current.window, seat.playerId) !== null),
      "every confirmed word survives the close",
    );
  });

  it("closes on the clock with every seat that never confirmed out of time", () => {
    const opened_ = step(opened(), { type: "confirmWord", playerId: "hero", submission: wordOf(0) });
    const { window } = closed(opened_);

    assert.equal(window.status, "settled");
    assert.deepEqual(confirmed(window, "hero"), wordOf(0));
    assert.ok(
      SEATS.slice(1).every((seat) => slotOf(window, seat.playerId).status === "timed-out"),
      "every seat that never confirmed is out of time",
    );
  });

  it("refuses to close while the seats still have time", () => {
    const { table } = opened();

    assert.throws(() => timeout(table, ENDS_AT - 1), OfflineActionError);
  });

  it("confirms a seat's open draft for it at the deadline only when the table opted in", () => {
    const optedIn = step(
      opened({ autoSubmitDrafts: true }),
      { type: "draftWord", playerId: "ellis", submission: wordOf(1) },
    );

    assert.deepEqual(confirmed(closed(optedIn).window, "ellis"), wordOf(1));

    // The rules' default: the player must confirm, so the draft dies with the clock.
    const byDefault = step(opened(), { type: "draftWord", playerId: "ellis", submission: wordOf(1) });
    const timedOut = closed(byDefault).window;

    assert.equal(confirmed(timedOut, "ellis"), null);
    assert.equal(slotOf(timedOut, "ellis").status, "timed-out");
  });

  it("does not auto-submit a draft those tiles cannot build, even when the table opted in", () => {
    // A one-tile draft is one the window accepted (§12's floor belongs to the confirm), and
    // §12 refuses it at the close just the same: the seat runs out with no word.
    const opened_ = step(
      opened({ autoSubmitDrafts: true }),
      { type: "draftWord", playerId: "ellis", submission: { plays: [{ tileId: "s1-a" }] } },
    );
    const settled = closed(opened_).window;

    assert.equal(confirmed(settled, "ellis"), null);
    assert.equal(slotOf(settled, "ellis").status, "timed-out");
  });

  it("never mutates the slots it was handed", () => {
    const opened_ = opened();
    const before = structuredClone(opened_.table.slots);

    applyWord(opened_.table, { type: "confirmWord", playerId: "hero", submission: wordOf(0) }, ENDS_AT - 1);
    applyWord(opened_.table, { type: "draftWord", playerId: "ellis", submission: wordOf(1) }, ENDS_AT - 1);
    timeout(opened_.table, ENDS_AT);

    assert.deepEqual(opened_.table.slots, before);
  });
});
