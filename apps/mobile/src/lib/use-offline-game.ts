/**
 * use-offline-game.ts — the offline adapter: engine state in, `GameScreenState` out.
 *
 * This is the thin seam between `@wordpoker/game-rules` (which knows nothing about screens)
 * and the existing `GameScreen` (which knows nothing about the engine). It owns one
 * `OfflineState`, dispatches the hero's betting actions and word edits, and answers for the bots
 * on a beat of its own.
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
 * The mapping itself is the Hero View's (`@/lib/hero-view`), shared with the online adapter:
 * this file only decodes the engine's state into a `HeroPerspective` and dispatches the moves.
 *
 * No server, no socket, no import from either: the screen this feeds has to work with the
 * server stopped and the device in airplane mode.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  OfflineAction,
  PlayerId,
  PowerUpDealMode,
  PowerUpId,
  PowerUsedEvent,
  PrivateWordCheckState,
  TilePlay,
  WordRejectionReason,
} from "@wordpoker/contracts";
import { WORD_CHECKS_PER_HAND } from "@wordpoker/contracts";
import {
  BettingRejectionError,
  DEFAULT_STAKES,
  PowerRejectionError,
  WordRejectionError,
  availableTiles,
  canUsePower,
  chooseOfflineWord,
  chooseBotPower,
  decideBotPowerUse,
  decideOfflineMove,
  reduce,
  resolveSubmission,
  startHand,
  type Dictionary,
  type OfflineState,
} from "@wordpoker/game-rules";

import type { ChipFlight, GameScreenState, PlayerStatus } from "@/components/screens/game/game-types";
import { buildResultsSnapshot } from "@/components/screens/results/results-snapshot";
import type { ResultsSnapshot } from "@/components/screens/results/results-types";
import { isSupportedSeatCount, type SeatCount } from "@/components/table";
import type { WordDraft } from "@/components/word-builder";
import { colors, duration, palette } from "@/constants/theme";
import { feltControls, heroView, isUnbuildable, type HeroPerspective } from "@/lib/hero-view";
import { randomSeed } from "@/lib/offline-seed";
import type { PowerView } from "@/lib/power-view";

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
 * A table that is not ordinary offline play — the tutorial's guided hand (STO-507) — brings its
 * own clock, deal, gate and opponents. Absent, the table is the one `/offline` plays, on the
 * device clock with the heuristic bots.
 */
export interface OfflineSession {
  /** Reads the table's clock. The tutorial's is virtual: it stands still while held. */
  now: () => number;
  /**
   * While held nothing on the table moves by itself: no CPU beat and no deadline — betting turn,
   * §19's window or Power Draw — can fire, and a backgrounded app comes back to the same table.
   */
  held: boolean;
  /** Deals the session's table: its first hand, and every restart. */
  open: (nowMs: number) => OfflineState;
  /**
   * Applies one action through the engine, or refuses it with `null` — the table stays where it
   * was, as it does for a stale tap. The engine's own refusals still throw as they always do.
   */
  reduce: (state: OfflineState, action: OfflineAction, nowMs: number) => OfflineState | null;
  /** The opponents' one move for this beat, or `null` when none is owed. */
  nextMove: (state: OfflineState, nowMs: number) => OfflineAction | null;
}

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
  /** The hero's private quota and latest explicit dictionary result. */
  wordCheck: PrivateWordCheckState;
  /**
   * The settled hand as the results screen renders it, or `null` while no hand has paid out.
   * Mapped off the engine's own numbers — §7's score, §21's order, §25's pots — and handed to
   * the surface once, which freezes it: the table can deal again behind the results, and
   * nothing on screen follows it (STO-380).
   */
  results: ResultsSnapshot | null;
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
  /** The row's check/call button: the confirm inside §19's window, else the check or call it is armed for. */
  primary: () => void;
  /** The felt's bet/raise slider: `bet` while nothing is out, `raiseTo` otherwise. */
  wager: (amount: number) => void;
  /**
   * Replaces the hero's draft with the one the seat has built: one submission, whatever the
   * edit was. The engine judges the whole draft, and a draft it cannot build is refused with
   * §11's reason while the seat still has time to fix it.
   */
  setDraft: (plays: readonly TilePlay[]) => void;
  /** Confirms the hero's draft as its word (§19). */
  confirmWord: () => void;
  /** Checks the current draft against this hand's dictionary using one private attempt. */
  checkWord: () => void;
  /** The hero's side of §44's power-ups; `null` at a Classic table. */
  powers: PowerView | null;
  /** Keeps one of the powers the Power Draw offered the hero. */
  pickPower: (powerUpId: PowerUpId) => void;
  /**
   * Uses the hero's held power on one of its private tiles. The new tile takes the discarded
   * one's place, and the discarded tile leaves the hero's draft. A use the engine refuses — off
   * the hero's turn, a tap that raced the clock — is dropped, as a stale betting tap is.
   */
  usePower: (powerUpId: PowerUpId, tileId: string) => void;
  /** The felt has shown a "power used" card and it has cleared. */
  endPowerUsed: (event: PowerUsedEvent) => void;
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
 * The longest delay a timer can hold. `setTimeout` takes a 32-bit signed delay, so anything past
 * roughly 24.8 days overflows — and an overflowing delay is not a long wait, it is an immediate
 * one. A table given a clock nobody can run out of would settle the hero's turn the instant it
 * opened. A budget that long waits this long instead, which is forever as far as a session is
 * concerned.
 */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** How long to wait before the table's own deadline settles the turn. */
function untilDeadline(endsAtMs: number, nowMs: number): number {
  return Math.min(Math.max(endsAtMs - nowMs, 0) + 25, MAX_TIMER_MS);
}

/**
 * Owns the offline hand. The bots answer on a beat of their own — one seat's move per
 * `duration.cpuBeat`, each its own transition — so a seat with nobody behind it still plays on
 * the table's clock, and the felt has a real state to paint between two of its moves.
 */
export function useOfflineGame({
  seed,
  dictionary,
  turnDurationMs,
  powerUps,
  session,
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
  /**
   * How long a seat has to act, overriding the engine's own budget. Only a caller tuning the
   * table passes one: the felt's countdown and the table's clock both read it, so a screen that
   * asks for a clock nobody can run out of gets one.
   */
  turnDurationMs?: number;
  /**
   * The table's power-up deal mode (§40): `choose3` is the Wild table, which opens §44's Power
   * Draw on every deal; absent or `off` is Classic, and plays exactly as the table always has.
   * It is the table's, so a new session keeps it.
   */
  powerUps?: PowerUpDealMode;
  /** The tutorial's table; absent for ordinary offline play. */
  session?: OfflineSession;
}): OfflineGame {
  // The session is read through a ref by the timers and the seam, like the state: a timer answers
  // the table — and the clock — as they stand when it fires.
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);
  const now = useCallback(() => sessionRef.current?.now() ?? Date.now(), []);
  const held = session?.held ?? false;

  const [state, setState] = useState<OfflineState>(() =>
    session !== undefined ? session.open(session.now()) :
    // The deal leaves the first turn to the seat clockwise from the button — a bot on this
    // roster — and that turn is taken on the same beat as every other one: the table is dealt
    // with a seat thinking, not with the opening already played out. At a Wild table the Power
    // Draw holds that turn back until it closes.
    openTable({ seed, dictionary, turnDurationMs, powerUps }),
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
   * What each seat was last seen doing, for the nameplate's pill: the engine keeps what a seat
   * committed and not the gesture that committed it, so CHECK, CALL, BET and RAISE — the pill's
   * own words — have nowhere else to come from.
   */
  const [seatActions, setSeatActions] = useState<readonly SeatAction[]>([]);

  /**
   * Notes the action the seat that just acted took, on the street it took it: a new street is a
   * table nobody has acted on yet, so every entry carries its own street and the felt drops the
   * ones the table has moved past. The write prunes in the same breath, so the list holds one
   * street rather than the hand's history.
   */
  const noteSeatAction = useCallback((previous: OfflineState, action: OfflineAction) => {
    // A power is used by a named seat — inside §19's window nobody is on the turn — and it sits
    // beside the street's betting action rather than replacing it: using one does not end a turn.
    const power = action.type === "usePowerUp" ? action.powerUpId : null;
    const seat =
      action.type === "usePowerUp"
        ? previous.seats.findIndex((candidate) => candidate.id === action.playerId)
        : previous.toActIndex;
    const status = actionStatus(action);
    if (seat === null || seat < 0 || (status === null && power === null)) return;

    const street = streetOf(previous);
    setSeatActions((live) => {
      const earlier = live.find((entry) => entry.street === street && entry.seat === seat);
      return [
        ...live.filter((entry) => entry.street === street && entry.seat !== seat),
        { seat, street, status: status ?? earlier?.status ?? null, power: power ?? earlier?.power ?? null },
      ];
    });
  }, []);

  /**
   * §44's public side: every power used this session that the felt has not shown yet. The felt's
   * card reports each one back when it clears, and the view drops those of hands gone by.
   */
  const [powerEvents, setPowerEvents] = useState<readonly PowerUsedEvent[]>([]);

  /**
   * Runs one action of the table's — the hero's tap, §19's clock, a CPU seat's turn — and lets
   * the beat carry on from wherever it left the table. A word the engine refused leaves the table
   * where it was and reports §11's reason instead: the payload never became the hero's word, and
   * the next tap is the hero's to make.
   *
   * A betting action the engine refused — the hero's clock fired as the hero tapped, or a second
   * tap landed on a control the last transition had already moved — is dropped the same way,
   * without a message: there is nothing for the seat to fix, and the felt is already rendering
   * the table that refused it. A refused power action is the same kind of stale tap.
   *
   * Reports whether the action landed, for the dispatcher that has more to do when it did.
   */
  const act = useCallback(
    (action: OfflineAction, at?: number): boolean => {
      const nowMs = at ?? now();
      // Read through the ref rather than through a render's closure: an action lands on the table
      // as it stands, whoever asked for it.
      const current = stateRef.current;
      try {
        const gate = sessionRef.current?.reduce;
        const next = gate === undefined ? reduce(current, action, nowMs) : gate(current, action, nowMs);
        if (next === null) return false;
        noteSeatAction(current, action);
        const used = powerUsedBy(current, action);
        if (used !== null) setPowerEvents((live) => [...live, used]);
        commit(current, next);
        setRefusal(null);
        return true;
      } catch (error) {
        if (error instanceof WordRejectionError) {
          setRefusal(error.reason);
          return false;
        }
        if (error instanceof BettingRejectionError || error instanceof PowerRejectionError) return false;
        throw error;
      }
    },
    [commit, noteSeatAction, now],
  );

  /**
   * The CPU answers on a beat of its own rather than inside the seat's transition: one seat's
   * move per beat, each its own commit, so what a bot did — its chips on their way to the middle,
   * its nameplate, the pot they land in — is on the felt before the next seat moves. It is also
   * what keeps a hand the seat is no longer in from running to the payout in one unreadable jump.
   *
   * The beat stops for the table's own clocks: §19's window is a deadline, and a bot that cannot
   * land its confirm before it runs out does not get to answer — the window's own timer is what
   * settles that one.
   */
  useEffect(() => {
    if (held || !cpuBeatPending(stateRef.current, now())) return;
    if (state.wordWindow?.status === "open" && state.endsAtMs - now() <= duration.cpuBeat) return;

    const timer = setTimeout(() => {
      // The move is read again against the state the table is in, not the one the beat was armed
      // for: a timer that fires late — a backgrounded app is the usual way — has to answer the
      // table as it stands, and past §19's deadline there is nothing left for a seat to answer.
      const current = stateRef.current;
      const move = (sessionRef.current?.nextMove ?? nextCpuMove)(current, now());
      const nowMs = now();
      if (move === null || cpuDeadlinePassed(current, nowMs)) return;
      if (move.type === "usePowerUp" && !canUsePower(current, move.playerId, nowMs)) return;
      act(move, nowMs);
    }, duration.cpuBeat);

    return () => clearTimeout(timer);
  }, [act, held, now, state.endsAtMs, state.phase, state.powers, state.seats, state.toActIndex, state.wordWindow]);

  const deal = useCallback(() => {
    if (state.sessionOver) return;
    setHeroDraft([]);
    setRefusal(null);
    act({ type: "deal" });
  }, [act, state.sessionOver]);

  const bet = useCallback(
    (amount: number) => act({ type: "bet", playerId: HERO_ID, amount }),
    [act],
  );

  const raiseTo = useCallback(
    (amount: number) => act({ type: "raise", playerId: HERO_ID, amount }),
    [act],
  );

  /** The hero's betting dispatchers: one engine action each, named as the felt names them. */
  const fold = useCallback(() => act({ type: "fold", playerId: HERO_ID }), [act]);
  const check = useCallback(() => act({ type: "check", playerId: HERO_ID }), [act]);
  const call = useCallback(() => act({ type: "call", playerId: HERO_ID }), [act]);
  const allIn = useCallback(() => act({ type: "allIn", playerId: HERO_ID }), [act]);

  /**
   * Restarts the session — what the end-of-session overlay's New game does. Fresh Table
   * Stacks come from the table's stakes and the seed is drawn again: a new session is a new
   * run, not a continuation of the one that ended (ADR 0002). A URL-pinned `?seed=` pins only
   * the session's first hand, as it always did; every later session is drawn.
   */
  const newGame = useCallback(() => {
    setHeroDraft([]);
    setRefusal(null);
    // A restart deals hand 1 again, and the felt is emptied here, where the restart commits, the
    // same way a deal empties it through the seam: the chips still in the air are the last hand's,
    // and so are the pills — they key on the hand and the phase together, so the words of a hand 1
    // that ended would read as words of the new one's street.
    setFlights([]);
    setSeatActions([]);
    setPowerEvents([]);
    const table = sessionRef.current;
    commit(
      stateRef.current,
      table !== undefined ? table.open(now()) : openTable({ seed: randomSeed(), dictionary, turnDurationMs, powerUps }),
    );
  }, [commit, dictionary, now, powerUps, turnDurationMs]);

  /**
   * Replaces the hero's draft with the one the seat has built — playing a tile, taking one back,
   * reordering the word, naming the other face of a choice tile. The draft is the client's own
   * the whole hand, so this holds it here and judges it against `game-rules` for the live
   * preview; a draft those tiles cannot build (the same tile twice, a letter the seat does not
   * hold, a word past §12's seven letters) is refused and the draft the seat had is the one that
   * stays, exactly as §19's window will refuse it. Once the window is open the engine is kept in
   * step too, so a clock that runs out scores the word the seat had built.
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
        act({ type: "draftWord", playerId: HERO_ID, submission: { plays: [...next] } });
      }
    },
    [act, heroIndex, state],
  );

  const confirmWord = useCallback(() => {
    if (heroDraft.length === 0 || state.wordWindow?.status !== "open") return;
    act({ type: "confirmWord", playerId: HERO_ID, submission: { plays: [...heroDraft] } });
  }, [act, heroDraft, state]);

  const checkWord = useCallback(() => {
    if (heroDraft.length < 2 || heroDraft.length > 7) return;
    act({ type: "checkWord", playerId: HERO_ID, submission: { plays: [...heroDraft] } });
  }, [act, heroDraft]);

  // §19's clock belongs to the table, not to the hero's taps: a window that runs out with a
  // seat still drafting settles on its own, a beat after the deadline so the engine reads the
  // clock as run out rather than a millisecond early.
  useEffect(() => {
    if (held || state.wordWindow?.status !== "open") return;

    const timer = setTimeout(() => {
      // The window may have closed while this timer was armed — the hero confirmed, the hand
      // paid out — and a clock that fired into a table that has already moved on has nothing
      // left to settle.
      const current = stateRef.current;
      if (current.wordWindow?.status !== "open") return;

      act({ type: "timeoutWords" }, Math.max(now(), current.endsAtMs));
    }, untilDeadline(state.endsAtMs, now()));

    return () => clearTimeout(timer);
  }, [act, held, now, state.wordWindow, state.endsAtMs]);

  // A betting turn belongs to the table's clock too: when any seat's clock runs out the engine's
  // own `timeoutTurn` folds the seat, whatever it owed and whether or not it could have checked
  // (§15, ADR 0006) — and the bots answer on their beat as they answer a tap.
  useEffect(() => {
    const index = state.toActIndex;
    if (held || state.betting === null || index === null || state.seats[index] === undefined) return;
    const playerId = state.seats[index].id;

    const timer = setTimeout(() => {
      // The turn may have moved on while this timer was armed, and a seat that is no longer the
      // one to act is not the seat this clock is for.
      const current = stateRef.current;
      const currentIndex = current.toActIndex;
      if (current.betting === null || currentIndex === null || current.seats[currentIndex]?.id !== playerId) {
        return;
      }

      act({ type: "timeoutTurn" }, Math.max(now(), current.endsAtMs));
    }, untilDeadline(state.endsAtMs, now()));

    return () => clearTimeout(timer);
  }, [act, held, now, state.betting, state.toActIndex, state.endsAtMs, state.seats]);

  // §44's Power Draw holds the table: nobody is on the clock while it is open, so neither the
  // betting beat nor the hero's turn clock runs; after the hero picks, CPUs pick on their beats.
  // Pre-flop's first turn arms when the draw closes. Its
  // own clock is the table's too — a hero who never picks keeps the first offer when it runs out.
  const drawOpen = state.powers?.draw.status === "open";
  useEffect(() => {
    if (held || !drawOpen) return;

    const timer = setTimeout(() => {
      const current = stateRef.current;
      if (current.powers?.draw.status !== "open") return;

      act({ type: "timeoutPowerDraw" }, Math.max(now(), current.endsAtMs));
    }, untilDeadline(state.endsAtMs, now()));

    return () => clearTimeout(timer);
  }, [act, drawOpen, held, now, state.endsAtMs]);

  // The deadline the felt has seen pass. The settling timers above wait a beat past it, so until
  // they fire the table still shows the clock that ran out; this one fires on the deadline itself,
  // so a held power stops reading as usable the moment the engine would start refusing it.
  const [ranOutAtMs, setRanOutAtMs] = useState<number | null>(null);
  const tracksPowers = state.powers !== undefined;
  useEffect(() => {
    if (held || !tracksPowers) return;

    const endsAtMs = state.endsAtMs;
    const timer = setTimeout(
      () => setRanOutAtMs(endsAtMs),
      Math.min(Math.max(endsAtMs - now(), 0), MAX_TIMER_MS),
    );

    return () => clearTimeout(timer);
  }, [held, now, tracksPowers, state.endsAtMs]);

  const pickPower = useCallback(
    (powerUpId: PowerUpId) => {
      act({ type: "pickPower", playerId: HERO_ID, powerUpId });
    },
    [act],
  );

  const usePower = useCallback(
    (powerUpId: PowerUpId, tileId: string) => {
      if (!act({ type: "usePowerUp", playerId: HERO_ID, powerUpId, tileId })) {
        // A tap the clock beat — its timer delayed or suspended — still shows the power as spent
        // rather than leaving it lit for a second tap the engine will refuse too.
        const endsAtMs = stateRef.current.endsAtMs;
        if (now() >= endsAtMs) setRanOutAtMs(endsAtMs);
        return;
      }
      // The discarded tile leaves the draft the device holds between streets too; inside §19's
      // window the engine has already taken it out of the seat's slot.
      setHeroDraft((draft) => {
        const kept = draft.filter((play) => play.tileId !== tileId);
        return kept.length === draft.length ? draft : kept;
      });
    },
    [act, now],
  );

  const endPowerUsed = useCallback((event: PowerUsedEvent) => {
    setPowerEvents((live) => {
      const remaining = live.filter(
        (candidate) => candidate.handId !== event.handId || candidate.seat !== event.seat,
      );
      return remaining.length === live.length ? live : remaining;
    });
  }, []);

  const powers = useMemo(
    () => powerViewOf(state, powerEvents, ranOutAtMs === state.endsAtMs),
    [powerEvents, ranOutAtMs, state],
  );

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

  const view = useMemo(
    () =>
      heroView(perspectiveOf(state, flights, seatActions), {
        draft: heroDraft,
        refusal,
        pendingPill: null,
        pendingConfirm: false,
      }),
    [flights, heroDraft, refusal, seatActions, state],
  );
  const { game } = view;

  // The settled hand, mapped off the state that settled it. Only a paid-out hand has one, so
  // this is null on every other street — the results do not exist until the pot has moved.
  const results = useMemo(
    () => (state.result === null ? null : buildResultsSnapshot({ state, players: game.players })),
    [game.players, state],
  );

  // The row's two shared controls, bound at the tap to whatever move the row is armed for.
  const primary = useCallback(
    () => feltControls(game.betting, { confirm: confirmWord, check, call, bet, raiseTo }).primary(),
    [bet, call, check, confirmWord, game.betting, raiseTo],
  );
  const wager = useCallback(
    (amount: number) =>
      feltControls(game.betting, { confirm: confirmWord, check, call, bet, raiseTo }).wager(amount),
    [bet, call, check, confirmWord, game.betting, raiseTo],
  );

  return {
    game,
    words: view.words,
    wordCheck: view.wordCheck,
    results,
    deal,
    fold,
    check,
    bet,
    call,
    raiseTo,
    allIn,
    primary,
    wager,
    setDraft,
    confirmWord,
    checkWord,
    powers,
    pickPower,
    usePower,
    endPowerUsed,
    endChipFlight,
    sessionOver: game.sessionOver,
    newGame,
  };
}

/**
 * §44's power-ups as the hero sees them (`PowerView`), or `null` at a Classic table. Everything
 * here is read off the engine: the hero's slot in the draw, what it holds and whether the engine
 * would take a use right now, and the swap the held power recorded. The public events are the
 * adapter's own record, kept to this hand and named by the roster.
 */
function powerViewOf(
  state: OfflineState,
  events: readonly PowerUsedEvent[],
  clockRanOut: boolean,
): PowerView | null {
  const powers = state.powers;
  if (powers === undefined) return null;

  const slot = powers.draw.slots.find((candidate) => candidate.playerId === HERO_ID);
  const held = powers.held[HERO_ID];
  // The table's own timers settle every deadline — a turn that runs out is folded, a window that
  // runs out is closed — but a beat after it, so the clock in play is either still running or
  // has just run out and is waiting to be settled. Reading "now" as its last millisecond, or as
  // the deadline itself once it has passed, asks the engine exactly that without a clock read in
  // render.
  const nowMs = clockRanOut ? state.endsAtMs : state.endsAtMs - 1;

  return {
    draw:
      powers.draw.status === "open" && slot !== undefined
        ? { offers: slot.offers, endsAtMs: powers.draw.endsAtMs, picked: slot.picked }
        : null,
    held:
      held === undefined
        ? null
        : { id: held.id, used: held.used, usable: canUsePower(state, HERO_ID, nowMs) },
    swap:
      held?.swap === undefined
        ? null
        : {
            handId: state.hand,
            powerUpId: held.id,
            discardedTileId: held.swap.discardedTileId,
            tile: held.swap.tile,
          },
    used: events
      .filter((event) => event.handId === state.hand)
      .map((event) => ({
        ...event,
        name: ROSTER[event.seat]?.name ?? state.seats[event.seat]?.id ?? "",
        mine: state.seats[event.seat]?.id === HERO_ID,
      })),
  };
}

/**
 * Deals a session's first hand at this table: the roster, the offline stakes, the table's clock
 * and its power-up mode. The first deal and New game both come through here, so a restarted
 * session is the same table with a fresh seed.
 */
function openTable({
  seed,
  dictionary,
  turnDurationMs,
  powerUps,
}: {
  seed: number;
  dictionary: Dictionary;
  turnDurationMs: number | undefined;
  powerUps: PowerUpDealMode | undefined;
}): OfflineState {
  return startHand({
    seed,
    players: ROSTER.map((player) => player.id),
    nowMs: Date.now(),
    dictionary,
    stakes: DEFAULT_STAKES,
    turnDurationMs,
    ...(powerUps === "choose3" ? { powerUps: { deal: "choose3" } } : {}),
  });
}

/**
 * The one move the CPU owes the table, whoever it is holding up: the betting turn of the seat
 * the engine has to act on, or — inside §19's window — the next bot with a word to confirm.
 * `null` when the table is not a CPU's to move: the seat is to act, the window is waiting on the
 * seat or on its clock, or the hand has paid out.
 *
 * A bot whose tiles spell nothing the table counts is passed over rather than stopping the pass:
 * §19 leaves its slot to the clock, and the seats behind it in seat order still get to answer.
 */
function nextCpuMove(state: OfflineState, nowMs: number): OfflineAction | null {
  // A settled hand is dealt by the seat, not by a bot: `deal` is the felt's own control.
  if (state.phase === "payout" || cpuDeadlinePassed(state, nowMs)) return null;

  const draw = state.powers?.draw;
  if (draw?.status === "open") {
    const hero = draw.slots.find((slot) => slot.playerId === HERO_ID);
    if (hero === undefined || hero.picked === null) return null;
    const slot = draw.slots.find((slot) => slot.playerId !== HERO_ID && slot.picked === null);
    return slot === undefined ? null : {
      type: "pickPower", playerId: slot.playerId, powerUpId: chooseBotPower(state, slot.playerId),
    };
  }

  const window = state.wordWindow;
  if (window?.status === "open") {
    for (const slot of window.slots) {
      if (slot.playerId === HERO_ID || slot.status !== "drafting") continue;

      const use = decideBotPowerUse(state, slot.playerId, nowMs);
      if (use !== null) return { type: "usePowerUp", playerId: slot.playerId, ...use };

      const submission = chooseOfflineWord({
        available: availableTiles(state, slot.seat),
        dictionary: state.dictionary,
      });
      if (submission !== null) {
        return { type: "confirmWord", playerId: slot.playerId, submission };
      }
    }
    return null;
  }

  const index = state.toActIndex;
  const acting = index === null ? undefined : state.seats[index];
  if (index === null || acting === undefined || acting.id === HERO_ID) return null;

  const use = decideBotPowerUse(state, acting.id, nowMs);
  return use === null ? decideOfflineMove(state, acting.id) : { type: "usePowerUp", playerId: acting.id, ...use };
}

/** A cheap timer predicate: all word searches run only inside the scheduled beat. */
function cpuBeatPending(state: OfflineState, nowMs: number): boolean {
  if (state.phase === "payout" || cpuDeadlinePassed(state, nowMs)) return false;
  const draw = state.powers?.draw;
  if (draw?.status === "open") {
    const hero = draw.slots.find((slot) => slot.playerId === HERO_ID);
    return hero !== undefined && hero.picked !== null &&
      draw.slots.some((slot) => slot.playerId !== HERO_ID && slot.picked === null);
  }
  if (state.wordWindow?.status === "open") {
    return state.wordWindow.slots.some((slot) => slot.playerId !== HERO_ID && slot.status === "drafting");
  }
  const acting = state.toActIndex === null ? undefined : state.seats[state.toActIndex];
  return acting !== undefined && acting.id !== HERO_ID;
}

/** Deadline timers settle the table; a delayed or slow CPU decision never extends them. */
function cpuDeadlinePassed(state: OfflineState, nowMs: number): boolean {
  return nowMs >= (state.powers?.draw.status === "open" ? state.powers.draw.endsAtMs : state.endsAtMs);
}

/**
 * What a seat was last seen doing, and the street it did it on: the nameplate's own vocabulary
 * for the actions that leave nothing behind them. FOLD and ALL-IN are not here — the seat's own
 * flags carry those, and a pill saying FOLD for a folded seat is the engine's answer already.
 * A power used on the street rides beside the betting action (§44): `status` is `null` for a
 * seat that has used one and not acted yet.
 */
interface SeatAction {
  readonly seat: number;
  readonly status: Extract<PlayerStatus, "bet" | "check" | "call" | "raise"> | null;
  readonly power: PowerUpId | null;
  readonly street: string;
}

/**
 * The public event a power action makes, read off the table it landed on: who used which power,
 * on which street. `null` for every other action. Only called once the engine has taken the use,
 * which it never does at the payout.
 */
function powerUsedBy(state: OfflineState, action: OfflineAction): PowerUsedEvent | null {
  if (action.type !== "usePowerUp" || state.phase === "payout") return null;

  return {
    handId: state.hand,
    seat: state.seats.findIndex((seat) => seat.id === action.playerId),
    powerUpId: action.powerUpId,
    street: state.phase,
  };
}

/** The street an action was taken on, as the felt tells the ones the table has moved past. */
function streetOf(state: OfflineState): string {
  return `${state.hand}:${state.phase}`;
}

/** What the felt calls an action, or null for the ones no nameplate prints. */
function actionStatus(action: OfflineAction): SeatAction["status"] | null {
  switch (action.type) {
    case "check":
      return "check";
    case "call":
      return "call";
    case "bet":
      return "bet";
    case "raise":
      return "raise";
    default:
      // FOLD and ALL-IN are the seat's own flags, a deal is not an action a seat took, and a
      // word is §19's business rather than a betting round's.
      return null;
  }
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
  const handId = handIdOf(next);

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

function handIdOf(state: OfflineState): string {
  return `offline-hand-${state.hand}`;
}

/**
 * The engine's table as the Hero View reads it. The offline felt seats every player in engine
 * order, so a seat's place on the felt is its engine index, and the hero's turn is the turn index.
 */
function perspectiveOf(
  state: OfflineState,
  flights: readonly ChipFlight[],
  seatActions: readonly SeatAction[],
): HeroPerspective {
  const heroIndex = state.seats.findIndex((seat) => seat.id === HERO_ID);
  const hero = state.seats[heroIndex];
  const slot = state.wordWindow?.slots.find((candidate) => candidate.seat === heroIndex);
  // Who acted on this street, as the pills read it: every entry the table has moved past — the
  // street before this one, the hand before this one — is dropped here rather than unwound.
  const street = streetOf(state);

  return {
    // One turn, one identity: it has to name the seat and the street, not just the hand.
    id: `offline-${state.hand}-${state.phase}-${state.toActIndex ?? state.wordWindow?.status ?? "done"}`,
    handId: handIdOf(state),
    flights,
    lastActions: new Map(
      seatActions.flatMap((entry) =>
        entry.street === street && entry.status !== null ? [[entry.seat, entry.status] as const] : [],
      ),
    ),
    // §44's tag rides beside the street's action, from the same record: the power stays on the
    // nameplate after the seat checks or calls, until the street is gone.
    powerTags: new Map(
      seatActions.flatMap((entry) =>
        entry.street === street && entry.power !== null ? [[entry.seat, entry.power] as const] : [],
      ),
    ),
    phase: state.phase,
    seatCount: toSeatCount(state.seats.length),
    seats: state.seats.map((seat, index) => ({
      ...seat,
      place: index,
      name: ROSTER[index]?.name ?? seat.id,
      initials: ROSTER[index]?.initials ?? seat.id.slice(0, 2).toUpperCase(),
      color: colors.players[index % colors.players.length] ?? palette.amber400,
    })),
    heroIndex,
    actingIndex: state.toActIndex,
    // The button rides on the seat index, which is why a busted seat can still be the dealer.
    dealerIndex: state.dealerSeat,
    heroToAct: heroIndex >= 0 && state.toActIndex === heroIndex,
    powerDraw: state.powers?.draw.status === "open",
    turnDurationMs: state.turnDurationMs,
    round: state.betting,
    blinds: { smallBlind: state.stakes.smallBlind, bigBlind: state.stakes.bigBlind },
    community: state.community.map((tile, index) => (index < state.revealed ? tile : null)),
    privateTiles: hero?.privateTiles ?? [],
    available: heroIndex >= 0 ? availableTiles(state, heroIndex) : [],
    word: {
      open: state.wordWindow?.status === "open",
      hero: slot?.status ?? null,
      confirmedPlays: slot?.status === "confirmed" ? slot.submission.plays : null,
    },
    wordCheck:
      state.wordChecks[HERO_ID] ?? {
        checksRemaining: WORD_CHECKS_PER_HAND,
        result: null,
      },
    result: state.result,
    sidePots: state.result?.payout.pots.slice(1).map((pot) => pot.amount) ?? [],
    // The session ends when the table cannot seat a hand any more, and for this screen also when
    // the seat it speaks for has busted: the session is the hero's run, and a table that plays on
    // without the hero has nothing left to show.
    sessionOver: state.sessionOver || (state.phase === "payout" && (hero?.stack ?? 0) <= 0),
    dictionary: state.dictionary,
  };
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
