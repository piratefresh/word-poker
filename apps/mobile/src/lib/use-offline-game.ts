/**
 * use-offline-game.ts — the offline adapter: engine state in, `GameScreenState` out.
 *
 * This is the thin seam between `@wordpoker/game-rules` (which knows nothing about screens)
 * and the existing `GameScreen` (which knows nothing about the engine). It owns one
 * `OfflineState`, runs the fixed bot on the bots' turns *and* on their words, maps the settled
 * hand into the felt's winner, and maps everything else into the shape the felt already
 * renders.
 *
 * The dictionary arrives as an injected setting (`useDictionary` loads it one screen up), so
 * the hand is judged against exactly the list the table displays before play.
 *
 * Deliberately minimal: the hand's controls and the mapped state. The general form of this —
 * selectors, an animation-event stream, adapter lifecycle, and a source that can be swapped
 * between offline, tutorial, and the online room — is STO-277's store, and is where this goes
 * when the second adapter needs it.
 *
 * No server, no socket, no import from either: the screen this feeds has to work with the
 * server stopped and the device in airplane mode.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PlayerId, TilePlay, WordRejectionReason } from "@wordpoker/contracts";
import {
  OFFLINE_TURN_MS,
  WORD_WINDOW_MS,
  WordRejectionError,
  availableTiles,
  chooseOfflineWord,
  decideOfflineMove,
  reduce,
  resolveSubmission,
  startHand,
  type Dictionary,
  type OfflineSeat,
  type OfflineState,
  type SubmissionResolution,
} from "@wordpoker/game-rules";

import { PHASE_NUMBER } from "@/components/hud";
import type {
  GamePlayer,
  GameScreenState,
  PlayerStatus,
} from "@/components/screens/game/game-types";
import { isSupportedSeatCount, type SeatCount } from "@/components/table";
import { colors, palette } from "@/constants/theme";

/**
 * The seed a table starts from when the caller does not pick one. Fixed, so the offline
 * slice is the same hand on every device — a later story can seed it per player.
 */
export const OFFLINE_SEED = 20_260_919;

/** The hero always sits in this seat; the bots fill the rest, and act after them. */
const HERO_ID: PlayerId = "hero";

/**
 * The slice's roster. Names are fixed: there is no lobby and nobody to invite yet.
 *
 * The hero is a guest rather than "You" because the felt prints its own "· YOU" badge
 * beside the name of whoever holds `isHero` — naming the seat that same word would put
 * it on the felt twice.
 */
const ROSTER: readonly { id: PlayerId; name: string; initials: string }[] = [
  { id: HERO_ID, name: "Guest", initials: "GU" },
  { id: "ellis", name: "Ellis", initials: "EL" },
  { id: "jay", name: "Jay", initials: "JA" },
  { id: "mira", name: "Mira", initials: "MI" },
];

/**
 * No wallet, no blinds, and no betting in this slice, so the stack a seat shows is the
 * table's buy-in and never moves. It is here because a seat without a stack is not a
 * seat; it is not here because anything can win it.
 */
const NOMINAL_STACK = 1_000;

/** The betting controls, in their offline shape: present, and refusing every press. */
const NO_BETS = {
  minRaise: 0,
  maxRaise: 0,
  raiseStep: 0,
  raiseAmount: 0,
  canFold: false,
  canCheck: false,
  canRaise: false,
} as const;

/** What the word builder renders while §19's window is open (docs/rules/hand-flow.md §19). */
export interface OfflineWords {
  /** The hero's draft in word order; the confirmed word once the hero has confirmed. */
  readonly plays: readonly TilePlay[];
  /** The letters those plays spell, uppercase; "" while nothing is played. */
  readonly word: string;
  /** Why the draft would be refused if confirmed now, or null while it would stand (§11). */
  readonly reason: WordRejectionReason | null;
  /** True once the hero confirmed: the word is locked and no control is live (§19). */
  readonly confirmed: boolean;
  /** True while the hero may still play tiles, take them back, and confirm. */
  readonly open: boolean;
}

export interface OfflineGame {
  /** The mapped state: exactly what `GameScreen` renders. */
  game: GameScreenState;
  /** The word builder's view, or null outside §19's window. */
  words: OfflineWords | null;
  /** Starts the next hand. Only legal once the current hand has paid out. */
  deal: () => void;
  /**
   * Passes the hero's turn — or, while §19's window is open, closes the window with the clock
   * run out, which is how the hero skips building a word. The bots take their turns, and
   * their words, on their own.
   */
  advance: () => void;
  /** Appends a play to the hero's draft; a choice tile names the face it plays (§10). */
  play: (tileId: string, chosenFace?: string) => void;
  /** Takes back the hero's play at `index`. */
  removePlay: (index: number) => void;
  /** Clears the hero's draft. */
  clearDraft: () => void;
  /** Confirms the hero's draft as its word (§19). */
  confirmWord: () => void;
}

/**
 * Owns the offline hand. Everything the table decides for itself — the bots' turns, the bots'
 * words, §19's clock running out — resolves inside the same state transition that reached it,
 * so the screen never sits waiting on a seat that has nobody behind it.
 */
export function useOfflineGame({
  seed = OFFLINE_SEED,
  dictionary,
}: {
  seed?: number;
  dictionary: Dictionary;
}): OfflineGame {
  const [state, setState] = useState<OfflineState>(() =>
    startHand({ seed, players: ROSTER.map((player) => player.id), nowMs: Date.now(), dictionary }),
  );
  const [refusal, setRefusal] = useState<WordRejectionReason | null>(null);

  /**
   * Runs one change, then lets the bots answer it. A word the engine refused leaves the table
   * where it was and reports §11's reason instead: the payload never became the hero's word,
   * and the next tap is the hero's to make.
   */
  const act = useCallback(
    (change: (current: OfflineState) => OfflineState) => {
      try {
        setState(settleBots(change(state), Date.now()));
        setRefusal(null);
      } catch (error) {
        if (error instanceof WordRejectionError) {
          setRefusal(error.reason);
          return;
        }
        throw error;
      }
    },
    [state],
  );

  const plays = editablePlays(state);

  const deal = useCallback(() => act((current) => reduce(current, { type: "deal" }, Date.now())), [act]);

  const advance = useCallback(
    () =>
      act((current) =>
        current.wordWindow?.status === "open"
          ? // The window has no turn to pass: a tap here means the hero is done building, so
            // the slice runs §19's clock to its deadline and lets the timeout rule settle it.
            reduce(current, { type: "timeoutWords" }, current.endsAtMs)
          : reduce(current, { type: "advance" }, Date.now()),
      ),
    [act],
  );

  const draft = useCallback(
    (next: readonly TilePlay[]) =>
      act((current) =>
        reduce(
          current,
          { type: "draftWord", playerId: HERO_ID, submission: { plays: [...next] } },
          Date.now(),
        ),
      ),
    [act],
  );

  const play = useCallback(
    (tileId: string, chosenFace?: string) => {
      if (plays === null) return;
      draft([...plays, chosenFace === undefined ? { tileId } : { tileId, chosenFace }]);
    },
    [draft, plays],
  );

  const removePlay = useCallback(
    (index: number) => {
      if (plays === null) return;
      draft(plays.filter((_, at) => at !== index));
    },
    [draft, plays],
  );

  const clearDraft = useCallback(() => {
    if (plays === null) return;
    draft([]);
  }, [draft, plays]);

  const confirmWord = useCallback(() => {
    if (plays === null || plays.length === 0) return;
    act((current) =>
      reduce(current, { type: "confirmWord", playerId: HERO_ID, submission: { plays: [...plays] } }, Date.now()),
    );
  }, [act, plays]);

  // §19's clock belongs to the table, not to the hero's taps: a window that runs out with a
  // seat still drafting settles on its own, a beat after the deadline so the engine reads the
  // clock as run out rather than a millisecond early.
  useEffect(() => {
    if (state.wordWindow?.status !== "open") return;

    const timer = setTimeout(() => {
      setState((current) =>
        current.wordWindow?.status === "open"
          ? settleBots(reduce(current, { type: "timeoutWords" }, Math.max(Date.now(), current.endsAtMs)), Date.now())
          : current,
      );
    }, Math.max(state.endsAtMs - Date.now(), 0) + 25);

    return () => clearTimeout(timer);
  }, [state.wordWindow, state.endsAtMs]);

  return {
    game: useMemo(() => toScreenState(state), [state]),
    words: useMemo(() => wordsOf(state, refusal), [state, refusal]),
    deal,
    advance,
    play,
    removePlay,
    clearDraft,
    confirmWord,
  };
}

/** The hero's plays while it can still edit them, or null when the window is closed or locked. */
function editablePlays(state: OfflineState): readonly TilePlay[] | null {
  const window = state.wordWindow;
  if (window === null || window.status !== "open") return null;

  const slot = window.slots.find((candidate) => candidate.playerId === HERO_ID);
  return slot?.status === "drafting" ? slot.draft?.plays ?? [] : null;
}

/**
 * Passes every consecutive bot turn, stopping at the hero, at §19's window, or at payout.
 */
function resolveBotTurns(state: OfflineState): OfflineState {
  let next = state;

  while (next.phase !== "payout") {
    const acting = actingSeat(next);
    if (acting === undefined || acting.id === HERO_ID) return next;
    next = reduce(next, decideOfflineMove(next, acting.id), Date.now());
  }

  return next;
}

/**
 * Plays every bot's word for it: §19's window is shared and has no turn to take, so a seat
 * with nobody behind it answers through this instead.
 *
 * A bot whose tiles spell nothing the table counts confirms nothing and runs out with the
 * clock, which §11 scores 0 — the same as any seat that never confirmed.
 */
function settleBots(state: OfflineState, nowMs: number): OfflineState {
  let next = resolveBotTurns(state);

  for (const [index, seat] of next.seats.entries()) {
    if (seat.id === HERO_ID || next.wordWindow?.status !== "open") continue;

    const slot = next.wordWindow.slots[index];
    if (slot?.status !== "drafting") continue;

    const submission = chooseOfflineWord({ available: availableTiles(next, index), dictionary: next.dictionary });
    if (submission === null) continue;

    next = reduce(next, { type: "confirmWord", playerId: seat.id, submission }, nowMs);
  }

  return next;
}

/**
 * What the word builder shows: the hero's plays, the word they spell, and whether §11 would
 * take it — the engine's own answer, computed here for the instant preview the client is
 * allowed to give itself (AGENTS.md). The payout re-judges the same submission authoritatively.
 */
function wordsOf(state: OfflineState, refusal: WordRejectionReason | null): OfflineWords | null {
  const window = state.wordWindow;
  if (window === null) return null;

  const index = state.seats.findIndex((seat) => seat.id === HERO_ID);
  const slot = window.slots[index];
  const plays =
    slot?.status === "confirmed"
      ? slot.submission.plays
      : slot?.status === "drafting"
        ? slot.draft?.plays ?? []
        : [];

  const resolution = resolveSubmission({
    available: availableTiles(state, index),
    submission: { plays: [...plays] },
  });

  return {
    plays,
    word: resolution.ok ? resolution.word : "",
    reason: refusal ?? previewReason(plays.length, resolution, state.dictionary),
    confirmed: slot?.status === "confirmed",
    open: window.status === "open" && slot?.status === "drafting",
  };
}

/** §11's answer for a draft that has not been confirmed yet; an empty or partial draft is not a refusal. */
function previewReason(
  played: number,
  resolution: SubmissionResolution,
  dictionary: Dictionary,
): WordRejectionReason | null {
  if (played === 0) return null;
  // A one-letter draft is a word in progress, exactly as the window treats it: the floor
  // belongs to the confirm, not to the typing.
  if (!resolution.ok) return resolution.reason === "too-short" ? null : resolution.reason;
  return dictionary.isWord(resolution.word) ? null : "not-in-dictionary";
}

/** Everyone's standing at payout, and who it awards. */
function winnerOf(state: OfflineState): { id: PlayerId; score: number } | null {
  const best = state.result?.standings[0];
  return best === undefined ? null : { id: best.playerId, score: best.score };
}

/**
 * Everything the felt needs, mapped off the engine state.
 *
 * `secondsRemaining` is the turn's full budget rather than `endsAtMs` minus now: the HUD
 * holds a budget for the length of a turn and runs it down itself, and a value that
 * changed every second would land on a new turn key every second and restart the
 * countdown instead of counting it. The state's own deadline stays authoritative for
 * whoever advances an expired turn.
 */
function toScreenState(state: OfflineState): GameScreenState {
  const hero = state.seats.find((seat) => seat.id === HERO_ID);
  const winner = state.phase === "payout" ? winnerOf(state) : null;

  return {
    // One turn, one identity: the HUD re-anchors its countdown when this changes, so it
    // has to name the seat and the street, not just the hand.
    id: `offline-${state.hand}-${state.phase}-${state.toActIndex ?? state.wordWindow?.status ?? "done"}`,
    phase: state.phase,
    phaseNumber: PHASE_NUMBER[state.phase],
    secondsRemaining: (state.wordWindow?.status === "open" ? WORD_WINDOW_MS : OFFLINE_TURN_MS) / 1_000,
    seatCount: toSeatCount(state.seats.length),
    players: state.seats.map((seat, index) => player(seat, index, state, winner)),
    pot: 0,
    community: state.community.map((tile, index) => (index < state.revealed ? tile : null)),
    privateTiles: hero?.privateTiles ?? [],
    bestScore: winner?.score,
    betting: NO_BETS,
  };
}

function player(
  seat: OfflineSeat,
  index: number,
  state: OfflineState,
  winner: { id: PlayerId } | null,
): GamePlayer {
  return {
    id: seat.id,
    name: ROSTER[index]?.name ?? seat.id,
    initials: ROSTER[index]?.initials ?? seat.id.slice(0, 2).toUpperCase(),
    // The felt badges this seat "· YOU" and the HUD names it in the spoken turn phrase;
    // without the flag the offline table never says which seat is the player's.
    isHero: seat.id === HERO_ID,
    stack: NOMINAL_STACK,
    color: colors.players[index % colors.players.length] ?? palette.amber400,
    status: seatStatus(seat, state, winner),
  };
}

function seatStatus(
  seat: OfflineSeat,
  state: OfflineState,
  winner: { id: PlayerId } | null,
): PlayerStatus {
  if (winner !== null) return winner.id === seat.id ? "winner" : "waiting";
  if (actingSeat(state)?.id !== seat.id) return "waiting";

  return seat.id === HERO_ID ? "your-turn" : "thinking";
}

function actingSeat(state: OfflineState): OfflineSeat | undefined {
  return state.toActIndex === null ? undefined : state.seats[state.toActIndex];
}

/**
 * The felt only draws the seat counts it supports, so a roster it cannot seat is a bug
 * worth hearing about rather than a table that silently drops a player.
 */
function toSeatCount(count: number): SeatCount {
  if (!isSupportedSeatCount(count)) {
    throw new Error(`the offline table seats ${count} players; the felt supports 4 to 6`);
  }
  return count;
}
