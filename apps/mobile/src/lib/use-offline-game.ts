/**
 * use-offline-game.ts — the offline adapter: engine state in, `GameScreenState` out.
 *
 * This is the thin seam between `@wordpoker/game-rules` (which knows nothing about screens)
 * and the existing `GameScreen` (which knows nothing about the engine). It owns one
 * `OfflineState`, dispatches the hero's betting actions and word edits, runs the fixed bot on
 * the bots' turns *and* on their words, and maps everything the table decided into the shape
 * the felt already renders.
 *
 * Legality is the engine's, never this file's: every control is armed from `bettingBounds`, so
 * a dispatcher here is only ever reached for an action the engine would accept (and a stale
 * one — a tap after the clock moved the turn — is dropped rather than crashing the table).
 *
 * The dictionary arrives as an injected setting (`useDictionary` loads it one screen up), so
 * the hand is judged against exactly the list the table displays before play.
 *
 * Every engine transition commits through one seam, and the chips it put in the air are read off
 * the seats' commitments either side of it — so a check or a fold emits nothing, and no action
 * has to remember to announce its own chips. The felt's layer over the table reports a flight
 * back when it lands, and that report is the only thing that prunes it.
 *
 * Deliberately minimal: the hand's controls and the mapped state. The general form of this —
 * selectors, an animation-event stream, adapter lifecycle, and a source that can be swapped
 * between offline, tutorial, and the online room — is STO-277's store, and is where this goes
 * when the second adapter needs it.
 *
 * No server, no socket, no import from either: the screen this feeds has to work with the
 * server stopped and the device in airplane mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BettingAction,
  PlayerId,
  TilePlay,
  WordRejectionReason,
} from "@wordpoker/contracts";
import {
  BettingRejectionError,
  DEFAULT_STAKES,
  OFFLINE_TURN_MS,
  WORD_WINDOW_MS,
  WordRejectionError,
  availableTiles,
  bettingBounds,
  chooseOfflineWord,
  decideOfflineMove,
  reduce,
  resolveSubmission,
  scoreWord,
  spellSubmission,
  startHand,
  type Dictionary,
  type HandResult,
  type OfflineSeat,
  type OfflineState,
  type SubmissionResolution,
} from "@wordpoker/game-rules";

import { PHASE_NUMBER } from "@/components/hud";
import type {
  BettingState,
  ChipFlight,
  GamePlayer,
  GameScreenState,
  PlayerStatus,
} from "@/components/screens/game/game-types";
import { isSupportedSeatCount, type SeatCount } from "@/components/table";
import type { WordDraft } from "@/components/word-builder";
import { colors, palette } from "@/constants/theme";
import { randomSeed } from "@/lib/offline-seed";

/** The hero always sits in this seat; the bots fill the rest. */
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
 * The row when the hero has nothing to do: no round of theirs is open, so every control is
 * dark. `raiseStep` still carries the table's step, because the slider's own arithmetic
 * divides by it even while the slider is inert.
 */
const INERT_BETS: BettingState = {
  minRaise: 0,
  maxRaise: 0,
  raiseStep: DEFAULT_STAKES.minBet,
  raiseAmount: 0,
  canFold: false,
  canCheck: false,
  canRaise: false,
  canBet: false,
  canAllIn: false,
  allInAmount: 0,
  currentBet: 0,
};

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
  /** Surrenders the hand (§22). */
  fold: () => void;
  /** Passes when nothing is owed; the engine refuses it while facing a bet. */
  check: () => void;
  /** Opens the round with `amount` committed this round. */
  bet: (amount: number) => void;
  /** Matches the current bet; a short stack calls short and goes all in (§23). */
  call: () => void;
  /** Raises to `amount` — a round total, not an increment (§22). */
  raiseTo: (amount: number) => void;
  /** Commits the hero's exact remaining Table Stack (§22). */
  allIn: () => void;
  /**
   * Replaces the hero's draft with the one the seat has built: one submission, whatever the
   * edit was. The engine judges the whole draft, and a draft it cannot build is refused with
   * §11's reason while the seat still has time to fix it.
   */
  setDraft: (plays: readonly TilePlay[]) => void;
  /** Confirms the hero's draft as its word (§19). */
  confirmWord: () => void;
  /**
   * A chip flight that has landed, so the felt stops drawing it. The layer over the table
   * reports its own flight's id when the chips are down; a new hand drops whatever is still in
   * the air on its own, so nothing depends on a report arriving.
   */
  endChipFlight: (id: string) => void;
  /**
   * Whether the session has ended — the hero is busted, or fewer than two seats can still
   * pay a hand (ADR 0002). The felt shows its end-state over the table.
   */
  sessionOver: boolean;
  /** Restarts the session: fresh Table Stacks, a fresh seed, hand 1. */
  newGame: () => void;
}

/**
 * Owns the offline hand. Everything the table decides for itself — the bots' turns, the bots'
 * words, a clock running out — resolves inside the same state transition that reached it, so
 * the screen never sits waiting on a seat that has nobody behind it.
 */
export function useOfflineGame({
  seed,
  dictionary,
}: {
  /**
   * The seed the whole session replays from: this hand, and every hand after it, since the
   * engine derives each next hand's seed from the one before (`game-rules`). The caller picks
   * it — `/offline` draws a fresh one per table, or takes the one the URL pins
   * (`@/lib/offline-seed`) — because the same seed anywhere has to be the same hand
   * everywhere.
   */
  seed: number;
  dictionary: Dictionary;
}): OfflineGame {
  const [state, setState] = useState<OfflineState>(() =>
    // The deal leaves the first turn to the seat clockwise from the button, which is a bot on
    // this roster: the opening turns settle before the first render, exactly as every later
    // bot turn settles inside the hero's own action.
    settleBots(
      startHand({
        seed,
        players: ROSTER.map((player) => player.id),
        nowMs: Date.now(),
        dictionary,
        stakes: DEFAULT_STAKES,
      }),
      Date.now(),
    ),
  );
  const [refusal, setRefusal] = useState<WordRejectionReason | null>(null);

  // The hero's word is built the whole hand, not only inside §19's window, so its draft lives
  // here across every street (the video's model — the builder runs in parallel with the
  // betting). The engine only learns of it when the seat confirms; until then it is the client's
  // own optimistic draft, judged against `game-rules` for the live preview (AGENTS.md).
  const [heroDraft, setHeroDraft] = useState<readonly TilePlay[]>([]);
  const heroIndex = state.seats.findIndex((seat) => seat.id === HERO_ID);

  // The chips the felt is drawing. It is the layer over the table that says when one has landed,
  // so this is where they are held until it does.
  const [flights, setFlights] = useState<readonly ChipFlight[]>([]);

  // A clock fires after the turn it belonged to may already have moved on, so it reads the state
  // through this rather than through the closure it was armed with: a transition has to name the
  // state it started from for its chips to be read off it, and the functional update that would
  // have hidden that is exactly what a `(previous, next)` pair needs to replace. The write is in
  // an effect — a ref may not be touched during render — and lands before any timer that follows
  // the render can run.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  /**
   * The engine's one seam: every transition commits through here, whoever asked for it — the
   * hero's tap, §19's window running out, the betting clock, a new deal. The chips a transition
   * puts in the air are read off the seats' commitments either side of it, so a transition that
   * moved no chips emits nothing, and no caller can miss a flight by not being wired up.
   */
  const commit = useCallback((previous: OfflineState, next: OfflineState) => {
    if (next === previous) return;
    setState(next);
    setFlights((live) => reconcileFlights(live, previous, next));
  }, []);

  /**
   * Runs one change, then lets the bots answer it. A word the engine refused leaves the table
   * where it was and reports §11's reason instead: the payload never became the hero's word,
   * and the next tap is the hero's to make.
   *
   * A betting action the engine refused — the hero's clock fired as the hero tapped, or a
   * second tap landed on a control the last transition had already moved — is dropped the
   * same way, without a message: there is nothing for the seat to fix, and the felt is
   * already rendering the table that refused it.
   */
  const act = useCallback(
    (change: (current: OfflineState) => OfflineState) => {
      try {
        commit(state, settleBots(change(state), Date.now()));
        setRefusal(null);
      } catch (error) {
        if (error instanceof WordRejectionError) {
          setRefusal(error.reason);
          return;
        }
        if (error instanceof BettingRejectionError) return;
        throw error;
      }
    },
    [commit, state],
  );

  const deal = useCallback(() => {
    if (state.sessionOver) return;
    setHeroDraft([]);
    setRefusal(null);
    act((current) => reduce(current, { type: "deal" }, Date.now()));
  }, [act, state.sessionOver]);

  const bet = useCallback(
    (amount: number) =>
      act((current) => reduce(current, { type: "bet", playerId: HERO_ID, amount }, Date.now())),
    [act],
  );

  const raiseTo = useCallback(
    (amount: number) =>
      act((current) => reduce(current, { type: "raise", playerId: HERO_ID, amount }, Date.now())),
    [act],
  );

  /** The hero's betting dispatchers: one engine action each, named as the felt names them. */
  const fold = useCallback(
    () => act((current) => reduce(current, { type: "fold", playerId: HERO_ID }, Date.now())),
    [act],
  );
  const check = useCallback(
    () => act((current) => reduce(current, { type: "check", playerId: HERO_ID }, Date.now())),
    [act],
  );
  const call = useCallback(
    () => act((current) => reduce(current, { type: "call", playerId: HERO_ID }, Date.now())),
    [act],
  );
  const allIn = useCallback(
    () => act((current) => reduce(current, { type: "allIn", playerId: HERO_ID }, Date.now())),
    [act],
  );

  /**
   * Restarts the session — what the end-of-session overlay's New game does. Fresh Table
   * Stacks come from the table's stakes and the seed is drawn again: a new session is a new
   * run, not a continuation of the one that ended (ADR 0002). A URL-pinned `?seed=` pins only
   * the session's first hand, as it always did; every later session is drawn.
   */
  const newGame = useCallback(() => {
    setHeroDraft([]);
    setRefusal(null);
    // A restart deals hand 1 again, and a session can end on hand 1 — so the hand counter alone
    // does not say this transition is a new one. The felt is emptied here, where the restart
    // commits, the same way a deal empties it through the seam.
    setFlights([]);
    commit(
      stateRef.current,
      settleBots(
        startHand({
          seed: randomSeed(),
          players: ROSTER.map((player) => player.id),
          nowMs: Date.now(),
          dictionary,
          stakes: DEFAULT_STAKES,
        }),
        Date.now(),
      ),
    );
  }, [commit, dictionary]);

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
      const hero = state.seats[heroIndex];
      if (state.phase === "payout" || hero === undefined || hero.folded || hero.sittingOut) return;

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
      // The window may have closed while this timer was armed — the hero confirmed, the hand
      // paid out — and a clock that fired into a table that has already moved on has nothing
      // left to settle.
      const current = stateRef.current;
      if (current.wordWindow?.status !== "open") return;

      commit(
        current,
        settleBots(
          reduce(current, { type: "timeoutWords" }, Math.max(Date.now(), current.endsAtMs)),
          Date.now(),
        ),
      );
    }, Math.max(state.endsAtMs - Date.now(), 0) + 25);

    return () => clearTimeout(timer);
  }, [commit, state.wordWindow, state.endsAtMs]);

  // A betting turn belongs to the table's clock too: when the hero's thirty seconds run out
  // the seat checks if it can and folds otherwise — §29's auto-fold, applied to the seat a
  // human left unattended — and the bots answer the same way they answer a tap.
  useEffect(() => {
    const index = state.toActIndex;
    if (state.betting === null || index === null || state.seats[index]?.id !== HERO_ID) return;

    const timer = setTimeout(() => {
      // The turn may have moved on while this timer was armed, and a seat that is no longer the
      // one to act is not the seat this clock is for.
      const current = stateRef.current;
      const currentIndex = current.toActIndex;
      const round = current.betting;
      if (round === null || currentIndex === null || current.seats[currentIndex]?.id !== HERO_ID) {
        return;
      }

      const bounds = bettingBounds(current.seats, round, currentIndex, current.stakes.minBet);
      if (bounds === null) return;

      const action: BettingAction = bounds.canCheck
        ? { type: "check", playerId: HERO_ID }
        : { type: "fold", playerId: HERO_ID };

      commit(
        current,
        settleBots(reduce(current, action, Math.max(Date.now(), current.endsAtMs)), Date.now()),
      );
    }, Math.max(state.endsAtMs - Date.now(), 0) + 25);

    return () => clearTimeout(timer);
  }, [commit, state.betting, state.toActIndex, state.endsAtMs, state.seats]);

  /**
   * A flight that has landed: the layer over the felt reports its own id, and the felt stops
   * drawing it. Nothing else ends one — a chip that lands is the layer's to report, and a new
   * hand is the one thing that drops one without a report.
   */
  const endChipFlight = useCallback((id: string) => {
    setFlights((live) => {
      const remaining = live.filter((flight) => flight.id !== id);
      // A second report of the same id is not a change the felt has to render for.
      return remaining.length === live.length ? live : remaining;
    });
  }, []);

  const game = useMemo(
    () => toScreenState(state, heroDraft, flights),
    [flights, heroDraft, state],
  );

  return {
    game,
    words: useMemo(() => wordsOf(state, heroDraft, refusal), [state, heroDraft, refusal]),
    deal,
    fold,
    check,
    bet,
    call,
    raiseTo,
    allIn,
    setDraft,
    confirmWord,
    endChipFlight,
    sessionOver: game.sessionOver,
    newGame,
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
  const window = next.wordWindow;
  if (window?.status !== "open") return next;

  for (const slot of window.slots) {
    if (slot.playerId === HERO_ID || slot.status !== "drafting") continue;

    const submission = chooseOfflineWord({
      available: availableTiles(next, slot.seat),
      dictionary: next.dictionary,
    });
    if (submission === null) continue;

    next = reduce(next, { type: "confirmWord", playerId: slot.playerId, submission }, nowMs);
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
 * confirms, the engine's locked submission takes over. There is no draft to show at payout, and
 * none once the hero is out of the hand: a folded seat builds no word (§19).
 */
function wordsOf(
  state: OfflineState,
  heroDraft: readonly TilePlay[],
  refusal: WordRejectionReason | null,
): WordDraft | null {
  const index = state.seats.findIndex((seat) => seat.id === HERO_ID);
  const hero = state.seats[index];
  if (state.phase === "payout" || hero === undefined || hero.folded || hero.sittingOut) return null;

  const window = state.wordWindow;
  const slot = window?.slots.find((candidate) => candidate.seat === index);
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
 * The chips one transition put in motion: a seat whose commitment grew across it sent the
 * difference to the middle, and each of those is a flight on the street the transition landed in.
 *
 * The diff is what makes the emission exact. A check, a fold, a street that reveals no chips and
 * a transition the engine refused all move no commitment and so emit nothing; and reading the
 * engine's own `committedHand` means no action has to remember to announce its own chips —
 * wherever the transition came from, it is here that its chips are found.
 *
 * The hand the ids are built from is the engine's own number for the hand in play: it holds for
 * the whole hand, so a flight is the same node on every render of it.
 */
function flightsBetween(previous: OfflineState, next: OfflineState): readonly ChipFlight[] {
  const handId = `offline-hand-${next.hand}`;

  return next.seats.reduce<ChipFlight[]>((flights, seat, seatIndex) => {
    const committed = seat.committedHand - (previous.seats[seatIndex]?.committedHand ?? 0);
    if (committed <= 0) return flights;

    flights.push({
      // `handId:street:seat:in` — stable while the hand is, and self-describing: the street is
      // the phase the chips were committed in, and the seat is the index the felt places chips
      // by. STO-354 is the first to emit the other direction, out of the pot.
      id: `${handId}:${next.phase}:${seatIndex}:in`,
      seatIndex,
      amount: committed,
      direction: "in",
    });
    return flights;
  }, []);
}

/**
 * The flights the felt goes on drawing, after one transition: the ones already in the air, plus
 * the chips that transition just sent.
 *
 * A seat that already has a flight for this street — the round re-opened and it acted again
 * before its chips landed — keeps the node it has, carrying the total it has committed there,
 * rather than stacking a second chip on the same path. The node is the flight's id, so the one
 * it has is the one it keeps.
 */
function reconcileFlights(
  live: readonly ChipFlight[],
  previous: OfflineState,
  next: OfflineState,
): readonly ChipFlight[] {
  // A transition that deals the next hand wipes the felt: the chips of the hand that just ended
  // have no business flying over the one that starts. (The session's own restart is the same
  // thing from hand 1, and clears the felt where it commits.)
  if (next.hand !== previous.hand) return [];

  const sent = flightsBetween(previous, next);
  if (sent.length === 0) return live;

  const flights = [...live];
  for (const flight of sent) {
    const at = flights.findIndex((candidate) => candidate.id === flight.id);
    const landed = at === -1 ? undefined : flights[at];
    if (landed === undefined) flights.push(flight);
    else flights[at] = { ...landed, amount: landed.amount + flight.amount };
  }
  return flights;
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
  flights: readonly ChipFlight[],
): GameScreenState {
  const heroIndex = state.seats.findIndex((seat) => seat.id === HERO_ID);
  const hero = state.seats[heroIndex];
  const best = state.result?.standings[0];
  const winners = winnerIds(state.result);

  return {
    // One turn, one identity: the HUD re-anchors its countdown when this changes, so it
    // has to name the seat and the street, not just the hand.
    id: `offline-${state.hand}-${state.phase}-${state.toActIndex ?? state.wordWindow?.status ?? "done"}`,
    handId: `offline-hand-${state.hand}`,
    phase: state.phase,
    phaseNumber: PHASE_NUMBER[state.phase],
    secondsRemaining: (state.wordWindow?.status === "open" ? WORD_WINDOW_MS : OFFLINE_TURN_MS) / 1_000,
    seatCount: toSeatCount(state.seats.length),
    players: state.seats.map((seat, index) => player(seat, index, state, winners)),
    // The pot is every chip committed this hand, in the layers §25 gives it: the main pot is
    // the first layer and the rest are side pots the felt draws under it.
    pot: state.seats.reduce((total, seat) => total + seat.committedHand, 0),
    sidePots: state.result?.payout.pots.slice(1).map((pot) => pot.amount) ?? [],
    flights,
    // The session ends when the table cannot seat a hand any more, and for this screen also
    // when the seat it speaks for has busted: the session is the hero's run, and a table that
    // plays on without the hero has nothing left to show.
    sessionOver: state.sessionOver || (state.phase === "payout" && (hero?.stack ?? 0) <= 0),
    community: state.community.map((tile, index) => (index < state.revealed ? tile : null)),
    privateTiles: hero?.privateTiles ?? [],
    bestScore: best?.score,
    // The felt's "winning word" line: the ladder's top place is the word that took the pot,
    // and §11's reasons mean a seat can top the table without one (the §21.3 draw) — then
    // there is no word to show and the line stays as the felt draws it. A fold-out has no
    // reveal at all and nothing to show (§26).
    bestWord: best?.word ?? undefined,
    betting: bettingRow(state, heroIndex, heroDraft),
  };
}

/** Which seats the settled hand paid: the ladder's first place, or §26's one survivor. */
function winnerIds(result: HandResult | null): readonly PlayerId[] {
  if (result === null) return [];
  if (result.standings.length === 0) return [result.winner];
  return result.standings.filter((standing) => standing.place === 1).map((standing) => standing.playerId);
}

/**
 * The action row, read off the engine's own bounds — never recomputed here (AGENTS.md: the
 * client renders what the engine decided). When the hero is to act, every control is exactly
 * as legal as `bettingBounds` says; on every other turn the row is inert, with one exception:
 * §19's window, where the check is the confirm, arms as soon as the hero has a draft to lock
 * in (the word window is not a betting round, so the engine has no bounds for it).
 */
function bettingRow(
  state: OfflineState,
  heroIndex: number,
  heroDraft: readonly TilePlay[],
): BettingState {
  const hero = state.seats[heroIndex];
  const round = state.betting;

  if (round !== null && heroIndex >= 0 && state.toActIndex === heroIndex && hero !== undefined) {
    const bounds = bettingBounds(state.seats, round, heroIndex, state.stakes.minBet);
    if (bounds !== null) {
      return {
        minRaise: bounds.minRaiseTo,
        maxRaise: bounds.maxRaiseTo,
        raiseStep: state.stakes.minBet,
        raiseAmount: bounds.minRaiseTo,
        canFold: bounds.canFold,
        canCheck: bounds.canCheck,
        ...(bounds.callAmount > 0 ? { callAmount: bounds.callAmount } : {}),
        canRaise: bounds.canRaise,
        canBet: bounds.canBet,
        canAllIn: bounds.canAllIn,
        allInAmount: hero.stack,
        currentBet: bounds.currentBet,
      };
    }
  }

  const window = state.wordWindow;
  const drafting =
    window?.status === "open" &&
    window.slots.some((slot) => slot.seat === heroIndex && slot.status === "drafting");

  return { ...INERT_BETS, canCheck: drafting === true && heroDraft.length > 0 };
}

function player(
  seat: OfflineSeat,
  index: number,
  state: OfflineState,
  winners: readonly PlayerId[],
): GamePlayer {
  return {
    id: seat.id,
    name: ROSTER[index]?.name ?? seat.id,
    initials: ROSTER[index]?.initials ?? seat.id.slice(0, 2).toUpperCase(),
    // The felt badges this seat "· YOU" and the HUD names it in the spoken turn phrase;
    // without the flag the offline table never says which seat is the player's.
    isHero: seat.id === HERO_ID,
    stack: seat.stack,
    color: colors.players[index % colors.players.length] ?? palette.amber400,
    // No blinds exist (ADR 0001), so the button is the only role a seat can hold — and it
    // rides on the seat index, which is why a busted seat can still be the dealer.
    ...(index === state.dealerSeat ? { role: "dealer" as const } : {}),
    // What the seat has committed this round, drawn as the chip beside it. A seat that has
    // put nothing in has no chip to show.
    ...(seat.committedRound > 0 ? { bet: seat.committedRound } : {}),
    status: seatStatus(seat, state, winners),
  };
}

function seatStatus(
  seat: OfflineSeat,
  state: OfflineState,
  winners: readonly PlayerId[],
): PlayerStatus {
  // A settled hand pays its winner(s) the pill before any other state: a seat that shoved
  // and won is a winner, not "all-in".
  if (state.phase === "payout" && winners.includes(seat.id)) return "winner";
  if (seat.sittingOut) return "busted";
  if (seat.folded) return "fold";
  if (seat.allIn) return "all-in";
  if (state.phase === "payout") return "waiting";

  const acting = actingSeat(state);
  if (acting?.id !== seat.id) return "waiting";

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
