/**
 * word-window.ts — §19's Word Window (`docs/rules/hand-flow.md` §19): the shared phase after the
 * river's betting round where every seat still in the hand drafts and confirms one word.
 *
 * The window owns its own rules and nothing else. It knows one clock for the whole table — the
 * seats have sixty seconds between them, not sixty each — one slot per seat still in the hand,
 * and a one-way status: a slot drafts, and then it is confirmed or out of time, never back. It
 * decides *when* it closes: the moment every slot is confirmed, or when the clock runs out. It
 * does not know what a close costs — the ladder, the pots and the payout belong to the hand that
 * opened it (`offline.ts`), which settles whatever this module hands back.
 *
 * It also owns the refusals that are the window's own: a word that arrives late, a seat that has
 * no slot, a word for a seat that already confirmed or already timed out. The two refusals that
 * are the hand's — there is no window yet, or the settled one is a record the hand has moved
 * past — stay with the hand, which is the only thing that can know where the table is.
 *
 * Nothing here reads a clock of its own or the hand's state: the caller passes `nowMs` and the
 * tiles it will judge the seat against, so the same slots and the same clock always give the
 * same window.
 */

import type {
  OfflineAction,
  PlayerId,
  Tile,
  WordSubmission,
} from "@wordpoker/contracts";

import { resolveSubmission } from "./building";
import { OfflineActionError, WordRejectionError } from "./errors";

/**
 * How long §19's word window stays open. One clock for the whole table: the rules give the
 * seats sixty seconds between them, not sixty each.
 */
export const WORD_WINDOW_MS = 60_000;

/**
 * One seat's slot in §19's window: the word it is working on, the word it committed to, or the
 * fact that its time ran out with no confirmed word — which §11 scores as 0 points.
 *
 * A slot only ever belongs to a seat that is still in the hand: a folded seat builds no word,
 * and neither does a seat sitting the hand out. `seat` is the seat's index in the hand's
 * `seats`, which is what lets the window judge a slot against the tiles of the seat it belongs
 * to.
 */
export type WordSlot =
  | {
      readonly seat: number;
      readonly playerId: PlayerId;
      /** What the seat has typed so far; `null` until it drafts anything. Editable. */
      readonly status: "drafting";
      readonly draft: WordSubmission | null;
    }
  | {
      readonly seat: number;
      readonly playerId: PlayerId;
      /** The word the seat confirmed. A confirmed word is locked and never replaced. */
      readonly status: "confirmed";
      readonly submission: WordSubmission;
    }
  | {
      readonly seat: number;
      readonly playerId: PlayerId;
      /** The window closed with nothing confirmed: this seat has no word (§11). */
      readonly status: "timed-out";
    };

/**
 * §19's word window.
 *
 * `slots` holds one slot per seat still in the hand, in seat order. The settled window stays in
 * the hand's state: it is the record of what each seat submitted, and the reveal and the pot are
 * read off it after the hand has moved on.
 */
export type WordWindow =
  | { readonly status: "open"; readonly slots: readonly WordSlot[] }
  | { readonly status: "settled"; readonly slots: readonly WordSlot[] };

/** A seat the window holds a slot for, as the hand names it: its index, and the id it plays as. */
export interface WindowSeat {
  readonly seat: number;
  readonly playerId: PlayerId;
}

/** A window just opened: its slots, and the deadline the whole table shares. */
export interface OpenWindow {
  readonly window: WordWindow;
  readonly endsAtMs: number;
}

/**
 * §19's window as the module reads it for one action: the slots, the shared deadline, the
 * table's auto-submit setting, and the tiles each seat will be judged against — which the
 * caller builds from its own state so the window never has to know what a hand is.
 */
export interface WindowTable {
  readonly slots: readonly WordSlot[];
  readonly endsAtMs: number;
  readonly autoSubmitDrafts: boolean;
  readonly tilesFor: (seat: number) => readonly Tile[];
}

/**
 * Opens §19's window: one drafting slot per seat handed in, all in seat order, on one clock
 * that starts at `nowMs`. The caller decides who is in the hand — a folded seat has no word to
 * build and a sitting-out seat is not in the hand at all, while an all-in seat still builds one.
 */
export function openWindow(inHand: readonly WindowSeat[], nowMs: number): OpenWindow {
  return {
    window: {
      status: "open",
      slots: inHand.map(({ seat, playerId }) => ({
        seat,
        playerId,
        status: "drafting",
        draft: null,
      })),
    },
    endsAtMs: nowMs + WORD_WINDOW_MS,
  };
}

/**
 * Drafts or confirms one seat's word inside §19's window, and reports the window that comes out
 * of it: still open, or settled the moment every slot has a confirmed word on it — the
 * deadline is a deadline, not a stay, and a table whose seats are all done moves on (§19).
 *
 * @throws {WordRejectionError} §11's reason, when the word is late or cannot be built.
 * @throws {OfflineActionError} When the seat has no slot, already confirmed, or timed out.
 */
export function applyWord(
  table: WindowTable,
  action: Extract<OfflineAction, { type: "draftWord" | "confirmWord" }>,
  nowMs: number,
): WordWindow {
  // The clock is the first thing checked, because it is what the seat ran out of: a word that
  // arrives late is refused as late, however good it is (§19).
  if (nowMs >= table.endsAtMs) {
    throw new WordRejectionError("timer-expired");
  }

  const index = table.slots.findIndex((slot) => slot.playerId === action.playerId);
  const slot = table.slots[index];
  if (slot === undefined) {
    throw new OfflineActionError(`${action.playerId} is not in the word window`);
  }
  if (slot.status === "confirmed") {
    throw new OfflineActionError(
      `${action.playerId} has confirmed a word, and a confirmed word cannot be replaced`,
    );
  }
  if (slot.status === "timed-out") {
    throw new OfflineActionError(`${action.playerId} is out of time; the window does not reopen`);
  }

  const slots = [...table.slots];

  // §19's draft is a sliding one, and clearing it is part of editing it: an empty submission
  // is how a seat says it has typed nothing. §11 refuses an empty *word*, and that refusal
  // still lands on a confirm below — a seat that confirms nothing never confirms at all.
  if (action.type === "draftWord" && action.submission.plays.length === 0) {
    slots[index] = { seat: slot.seat, playerId: slot.playerId, status: "drafting", draft: null };
  } else {
    const resolution = resolveSubmission({
      available: table.tilesFor(slot.seat),
      submission: action.submission,
    });

    // §12's floor is a rule about the word a seat stands behind, not about what it is typing:
    // a draft of one tile is a word in progress, and the floor is applied again at the confirm
    // — the moment the submission becomes the seat's word, and the moment `slots` is built.
    const typing = action.type === "draftWord" && !resolution.ok && resolution.reason === "too-short";
    if (!resolution.ok && !typing) {
      throw new WordRejectionError(resolution.reason);
    }

    slots[index] =
      action.type === "confirmWord"
        ? { seat: slot.seat, playerId: slot.playerId, status: "confirmed", submission: action.submission }
        : { seat: slot.seat, playerId: slot.playerId, status: "drafting", draft: action.submission };
  }

  return everySlotConfirmed(slots) ? close(slots, table) : { status: "open", slots };
}

/**
 * §19's window closing with the clock run out: every seat that never confirmed is out of time,
 * and the hand moves on to the payout. Only legal at or after the deadline — the seats still
 * have their sixty seconds until then — and the settled window is what the caller gets back, so
 * the reveal has every seat's word without another round trip.
 *
 * @throws {OfflineActionError} Before the deadline, when the seats may still confirm.
 */
export function timeout(
  table: WindowTable,
  nowMs: number,
): Extract<WordWindow, { status: "settled" }> {
  if (nowMs < table.endsAtMs) {
    throw new OfflineActionError(
      `the word window still has ${table.endsAtMs - nowMs}ms to run, so the seats may still confirm`,
    );
  }

  return close(table.slots, table);
}

/** Whether §19's window has nothing left to wait for: every seat that holds a slot has a word. */
function everySlotConfirmed(slots: readonly WordSlot[]): boolean {
  return slots.every((slot) => slot.status === "confirmed");
}

/** What a settled window leaves behind: the slots, with every unconfirmed draft resolved. */
function close(
  slots: readonly WordSlot[],
  table: WindowTable,
): Extract<WordWindow, { status: "settled" }> {
  return { status: "settled", slots: slots.map((slot) => closeSlot(slot, table)) };
}

/** How one seat's slot ends when the window closes (§19). */
function closeSlot(slot: WordSlot, table: WindowTable): WordSlot {
  if (slot.status !== "drafting") return slot;

  const draft = slot.draft;
  if (draft !== null && table.autoSubmitDrafts && isBuildable(table, slot.seat, draft)) {
    return { seat: slot.seat, playerId: slot.playerId, status: "confirmed", submission: draft };
  }

  return { seat: slot.seat, playerId: slot.playerId, status: "timed-out" };
}

/** Whether a submission can be built from what this seat holds at all (§10–§12, no dictionary). */
function isBuildable(table: WindowTable, seat: number, submission: WordSubmission): boolean {
  return resolveSubmission({ available: table.tilesFor(seat), submission }).ok;
}
