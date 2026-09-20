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

import type {
  PlayerId,
  TilePlay,
  WordRejectionReason,
} from "@wordpoker/contracts";
import {
  OFFLINE_TURN_MS,
  WORD_WINDOW_MS,
  WordRejectionError,
  availableTiles,
  chooseOfflineWord,
  decideOfflineMove,
  reduce,
  resolveSubmission,
  scoreWord,
  spellSubmission,
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
import type { WordDraft } from "@/components/word-builder";
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

/**
 * The betting row's fixed half, in its offline shape: fold and the bet are out of this slice
 * (STO-280), so they never arm; the check is the row's one live control and `bettingRow`
 * decides what it is for.
 */
const NO_BETS = {
  minRaise: 0,
  maxRaise: 0,
  raiseStep: 0,
  raiseAmount: 0,
  canFold: false,
  canCheck: false,
  canRaise: false,
} as const;

export interface OfflineGame {
  /** The mapped state: exactly what `GameScreen` renders. */
  game: GameScreenState;
  /**
   * §19's window as the word builder reads it, or null outside it
   * (docs/rules/hand-flow.md §19). The draft is in the builder's own vocabulary — the
   * engine's answers about the word, and nothing about this table — because the builder is
   * every mode's: the seated table's adapter maps its socket into the same shape.
   */
  words: WordDraft | null;
  /** Starts the next hand. Only legal once the current hand has paid out. */
  deal: () => void;
  /**
   * Passes the hero's turn — or, while §19's window is open, closes the window with the clock
   * run out, which is how the hero skips building a word. The bots take their turns, and
   * their words, on their own.
   */
  advance: () => void;
  /**
   * Replaces the hero's draft with the one the seat has built: one submission, whatever the
   * edit was. The engine judges the whole draft, and a draft it cannot build is refused with
   * §11's reason while the seat still has time to fix it.
   */
  setDraft: (plays: readonly TilePlay[]) => void;
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

  // The hero's word is built the whole hand, not only inside §19's window, so its draft lives
  // here across every street (the video's model — the builder runs in parallel with the
  // betting). The engine only learns of it when the seat confirms; until then it is the client's
  // own optimistic draft, judged against `game-rules` for the live preview (AGENTS.md).
  const [heroDraft, setHeroDraft] = useState<readonly TilePlay[]>([]);
  const heroIndex = state.seats.findIndex((seat) => seat.id === HERO_ID);

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

  const deal = useCallback(() => {
    setHeroDraft([]);
    setRefusal(null);
    act((current) => reduce(current, { type: "deal" }, Date.now()));
  }, [act]);

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

  /**
   * Replaces the hero's draft with the one the seat has built — playing a tile, taking one back,
   * reordering the word, naming the other face of a choice tile. The draft is the client's own
   * the whole hand, so this holds it here and judges it against `game-rules` for the live
   * preview; a draft those tiles cannot build (the same tile twice, a letter the seat does not
   * hold, a sequence out of order) is refused and the draft the seat had is the one that stays,
   * exactly as §19's window will refuse it. Once the window is open the engine is kept in step
   * too, so a clock that runs out scores the word the seat had built.
   */
  const setDraft = useCallback(
    (next: readonly TilePlay[]) => {
      if (state.phase === "payout") return;

      const resolution = resolveSubmission({
        available: availableTiles(state, heroIndex),
        submission: { plays: [...next] },
      });
      if (!resolution.ok && isUnbuildable(resolution.reason)) {
        setRefusal(resolution.reason);
        return;
      }

      setHeroDraft(next);
      setRefusal(null);
      if (state.wordWindow?.status === "open") {
        act((current) =>
          reduce(current, { type: "draftWord", playerId: HERO_ID, submission: { plays: [...next] } }, Date.now()),
        );
      }
    },
    [act, heroIndex, state],
  );

  const confirmWord = useCallback(() => {
    if (heroDraft.length === 0 || state.wordWindow?.status !== "open") return;
    act((current) =>
      reduce(current, { type: "confirmWord", playerId: HERO_ID, submission: { plays: [...heroDraft] } }, Date.now()),
    );
  }, [act, heroDraft, state]);

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
    game: useMemo(() => toScreenState(state, heroDraft), [state, heroDraft]),
    words: useMemo(() => wordsOf(state, heroDraft, refusal), [state, heroDraft, refusal]),
    deal,
    advance,
    setDraft,
    confirmWord,
  };
}

/**
 * Whether a draft is one the tiles cannot build at all (§10), as against one that is merely
 * unfinished. An unbuildable draft is refused and the previous one kept; a partial or empty one
 * (too short, still nothing) is a word in progress the seat is allowed to hold.
 */
function isUnbuildable(reason: WordRejectionReason): boolean {
  return (
    reason === "tile-reused" ||
    reason === "uses-unavailable-letters" ||
    reason === "two-letter-split" ||
    reason === "sequence-reversed" ||
    reason === "too-long"
  );
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
 * What the word builder shows: the hero's draft, the word it spells, and whether §11 would take
 * it — the engine's own answer, computed here for the instant preview the client is allowed to
 * give itself (AGENTS.md). The payout re-judges the same submission authoritatively.
 *
 * The draft is the client's the whole hand, so this reads the local `heroDraft` on every street
 * — the builder runs in parallel with the betting, not only inside §19's window. Once the seat
 * confirms, the engine's locked submission takes over. There is no draft to show at payout: the
 * hand is judged and the felt shows the winner.
 */
function wordsOf(
  state: OfflineState,
  heroDraft: readonly TilePlay[],
  refusal: WordRejectionReason | null,
): WordDraft | null {
  if (state.phase === "payout") return null;

  const index = state.seats.findIndex((seat) => seat.id === HERO_ID);
  const window = state.wordWindow;
  const slot = window?.slots[index];
  const confirmed = slot?.status === "confirmed";
  const plays = confirmed ? slot.submission.plays : heroDraft;

  const available = availableTiles(state, index);
  const resolution = resolveSubmission({ available, submission: { plays: [...plays] } });

  return {
    plays,
    // The letters the seat has typed, not the word it can stand behind: a one-tile draft has
    // a letter to show even though §12 refuses to call it a word yet.
    word: spellSubmission({ available, submission: { plays: [...plays] } }),
    // §7 on the same resolution: what the draft is worth as it stands, letter multipliers and
    // Full Rack Bonus included, so the seat watches the number move as it builds.
    score: resolution.ok ? scoreWord(resolution.tiles) : null,
    reason: refusal ?? previewReason(plays.length, resolution, state.dictionary),
    confirmed,
    // The seat may build until it confirms; only §19's window lets it lock the word in.
    open: !confirmed,
    confirmable: !confirmed && window?.status === "open" && slot?.status === "drafting",
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

/**
 * Everything the felt needs, mapped off the engine state.
 *
 * `secondsRemaining` is the turn's full budget rather than `endsAtMs` minus now: the HUD
 * holds a budget for the length of a turn and runs it down itself, and a value that
 * changed every second would land on a new turn key every second and restart the
 * countdown instead of counting it. The state's own deadline stays authoritative for
 * whoever advances an expired turn.
 */
function toScreenState(
  state: OfflineState,
  heroDraft: readonly TilePlay[],
): GameScreenState {
  const hero = state.seats.find((seat) => seat.id === HERO_ID);
  const best = state.result?.standings[0];
  const winner = state.phase === "payout" && best !== undefined ? { id: best.playerId, score: best.score } : null;

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
    // The felt's "winning word" line: the ladder's top place is the word that took the pot,
    // and §11's reasons mean a seat can top the table without one (the §21.3 draw) — then
    // there is no word to show and the line stays as the felt draws it.
    bestWord: best?.word ?? undefined,
    betting: bettingRow(state, heroDraft),
  };
}

/**
 * The action row's live half: the check, and what it is for right now.
 *
 * Checking commits no chips, which makes it the offline slice's whole round — the tap that
 * takes the seat's turn while the streets advance — and, once §19's window is open, the
 * confirm: the word as it stands is locked in, exactly as §19's "must confirm before the
 * clock runs out" requires, without a second control row to do it from.
 */
function bettingRow(state: OfflineState, heroDraft: readonly TilePlay[]): GameScreenState["betting"] {
  const window = state.wordWindow;
  const heroIndex = state.seats.findIndex((seat) => seat.id === HERO_ID);
  const drafting =
    window?.status === "open" && window.slots[heroIndex]?.status === "drafting";

  return {
    ...NO_BETS,
    canCheck:
      actingSeat(state)?.id === HERO_ID || (drafting && heroDraft.length > 0),
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
