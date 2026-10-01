/**
 * use-online-game.ts — the online adapter: the live room in, `GameScreenState` out.
 *
 * The offline counterpart of this file (`use-offline-game.ts`) turns a local engine into the
 * shape the felt renders; this one does the same job over the Colyseus room, so the felt, the
 * seats, the chips, the pots and the one word builder never learn whether they are online or
 * offline (AGENTS.md — never a second builder). It reads two streams from the room: the public
 * broadcast schema every seat shares, and the `privateState` message that carries this seat's
 * own rack and draft, and decodes both into a `HeroPerspective` — the Hero View
 * (`@/lib/hero-view`), shared with the offline adapter, maps that into the felt's
 * `GameScreenState` and the builder's `WordDraft`.
 *
 * Authority is the server's, never this file's: the room owns every mutation and the state it
 * broadcasts is the truth. The action row is armed from the engine's own `bettingBounds`, run
 * over the seats the broadcast carries, so a control is only offered for a move the server would
 * accept — and a move it still refuses comes back as a `rejected` event that reconciles against
 * the next broadcast. Optimistic prediction (previewing the hero's move before the server answers)
 * is STO-405; this adapter is server-wins throughout.
 *
 * The word is the client's own draft the whole hand, exactly as offline: `heroDraft` lives here
 * across every street and is judged against `game-rules` for the live preview, dispatched to the
 * room with `draftWord` once §19's window opens, and locked in with `confirmWord`. Until the seat
 * confirms, the server has not been told the word.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  GameRejectionEvent,
  LetterMultiplier,
  LetterTile,
  OnlineBettingAction,
  PlayerId,
  PrivateWordCheckState,
  RoomPhase,
  RoundPhase,
  Tile,
  TilePlay,
  WordCheckResult,
  WordRejectionReason,
  WordSubmission,
} from "@wordpoker/contracts";
import {
  GAME_EVENTS,
  GAME_MESSAGES,
  ROUND_PHASES,
  WAITING_PHASE,
  isGameRejectionEvent,
  isWordSubmission,
  WORD_CHECKS_PER_HAND,
} from "@wordpoker/contracts";
import { resolveSubmission, type Dictionary } from "@wordpoker/game-rules";

import type { GameScreenState } from "@/components/screens/game/game-types";
import { buildSettledSnapshot } from "@/components/screens/results/results-snapshot";
import type { ResultsSnapshot } from "@/components/screens/results/results-types";
import type { WordDraft } from "@/components/word-builder";
import { colors, palette } from "@/constants/theme";
import {
  feltControls,
  heroView,
  isUnbuildable,
  type HeroPerspective,
  type OptimisticPill,
} from "@/lib/hero-view";

/** The felt draws 4–6 seats; a smaller table still shows as a four-seat felt with empty places. */
const MIN_FELT_SEATS = 4;
const MAX_FELT_SEATS = 6;

/**
 * The minimal surface of a Colyseus `Room` this adapter drives: its own seat id, its synced
 * state, its subscription seams and `send`. Typing to this rather than the SDK's `Room` keeps
 * the adapter testable with a plain fake and free of a Colyseus import.
 */
export interface GameRoomLike {
  readonly sessionId: string;
  readonly state: unknown;
  onStateChange: ((cb: (state: unknown) => void) => unknown) & {
    remove: (cb: (state: unknown) => void) => void;
  };
  onMessage: (name: string, cb: (payload: unknown) => void) => () => void;
  send: (type: string, payload?: unknown) => void;
}

export interface OnlineGame {
  /** The mapped state the felt renders, or null while the table is still waiting to deal. */
  game: GameScreenState | null;
  /**
   * The settled hand as the results screen renders it, or null off the payout (STO-430). The
   * room holds its payout a few seconds before it deals again; the next deal clears this.
   */
  results: ResultsSnapshot | null;
  /** §19's window as the builder reads it, or null outside it. In the builder's own vocabulary. */
  words: WordDraft | null;
  /** The hero's private quota and latest explicit dictionary result. */
  wordCheck: PrivateWordCheckState;
  /** The table's phase, including the waiting room the felt has no hand for. */
  phase: RoomPhase;
  /**
   * The table before its first deal, or null once a hand is live: how many of its seats have said
   * ready, and whether the hero is one of them. `game` still draws the felt while it waits.
   */
  waiting: { ready: number; seated: number; heroReady: boolean } | null;
  /** Says (or takes back) that the hero is ready for the deal. */
  setReady: (ready: boolean) => void;
  /** Surrenders the hand (§22). */
  fold: () => void;
  /** Passes when nothing is owed. */
  check: () => void;
  /** Opens the round with `amount` committed this round. */
  bet: (amount: number) => void;
  /** Matches the current bet. */
  call: () => void;
  /** Raises to `amount` — a round total, not an increment (§22). */
  raiseTo: (amount: number) => void;
  /** Commits the hero's exact remaining Table Stack (§22). */
  allIn: () => void;
  /** The row's check/call button: the confirm inside §19's window, else the check or call it is armed for. */
  primary: () => void;
  /** The felt's bet/raise slider: `bet` while nothing is out, `raiseTo` otherwise. */
  wager: (amount: number) => void;
  /** Replaces the hero's draft with the one the seat has built. */
  setDraft: (plays: readonly TilePlay[]) => void;
  /** Confirms the hero's draft as its word (§19). */
  confirmWord: () => void;
  /** Sends the current draft to the server for one private dictionary check. */
  checkWord: () => void;
}

/** One public seat, decoded off the broadcast schema into plain values. */
interface SeatView {
  seat: number;
  playerId: PlayerId;
  connected: boolean;
  tableStack: number;
  committedRound: number;
  committedHand: number;
  allIn: boolean;
  folded: boolean;
  sittingOut: boolean;
  actedThisRound: boolean;
  ready: boolean;
}

interface WordSlotView {
  playerId: PlayerId;
  status: "drafting" | "confirmed" | "timed-out";
}

interface ResultStandingView {
  playerId: PlayerId;
  seat: number;
  score: number;
  place: number;
  word: string;
  reason: WordRejectionReason | null;
  /** The reveal, as the room priced it with `playedWord`: tiles in word order and §7's parts. */
  tiles: readonly Tile[];
  base: number;
  mult: number;
  rack: number;
}

/** The paid-out hand the broadcast carries: the ladder, the winner, and what the pots held. */
interface ResultView {
  winner: PlayerId;
  standings: readonly ResultStandingView[];
  /** Every chip the paid pots held (§25). */
  pot: number;
}

/** The broadcast schema, decoded into a plain snapshot so a React render sees a fresh value. */
interface RoomView {
  phase: RoomPhase;
  handCount: number;
  maxSeats: number;
  /** The table's own blinds (§5, ADR 0004), off the config the room broadcasts. */
  blinds: { smallBlind: number; bigBlind: number };
  /** Engine seat index of the dealer / the seat to act, mapped to a playerId below. */
  dealerSeat: number | null;
  toActSeat: number | null;
  seats: readonly SeatView[];
  community: readonly Tile[];
  betting: { currentBet: number; minRaise: number; bigBlind: number } | null;
  pots: readonly number[];
  word: { status: "open" | "settled"; slots: readonly WordSlotView[] } | null;
  result: ResultView | null;
}

/** The hero's private rack and word state, decoded off the targeted `privateState` message. */
interface PrivateView {
  /** The hand the rack was dealt for: the broadcast's `handCount` it belongs beside. */
  hand: number;
  rack: readonly Tile[];
  isYourTurn: boolean;
  wordCheck: PrivateWordCheckState;
  word: {
    status: "none" | "drafting" | "confirmed" | "timed-out";
    confirmed: readonly TilePlay[] | null;
  };
}

/** The hero's own move, held until the authoritative broadcast reconciles it away (server wins). */
type Pending =
  | { kind: "betting"; pill: OptimisticPill; viewId: string }
  | { kind: "confirm"; viewId: string };

/** One turn, one identity: the HUD re-anchors its countdown when this changes. */
function idOf(view: RoomView): string {
  return `online-${view.handCount}-${view.phase}-${view.toActSeat ?? view.word?.status ?? "done"}`;
}

/**
 * Drives one online hand off the live room. Subscribes to the broadcast state and the seat's
 * private state, holds the hero's draft locally, and dispatches every seat action to the room.
 */
export function useOnlineGame({
  room,
  dictionary,
  onReject,
}: {
  room: GameRoomLike;
  dictionary: Dictionary;
  /** A refused action, for a screen that wants to surface the server's "no" (STO-406). */
  onReject?: (event: GameRejectionEvent) => void;
}): OnlineGame {
  const heroId = room.sessionId;
  const [view, setView] = useState<RoomView | null>(() => decodeRoom(room.state));
  const [received, setPriv] = useState<PrivateView | null>(null);
  // The private message outruns the patch: the room sends the next hand's rack the instant it
  // deals, and the board that hand deals a patch later. Beside the last hand's board the new rack
  // can repeat a tile the reshuffled bag just handed back, so a rack counts only beside the board
  // of the hand it was dealt for — until then the seat holds nothing.
  const priv = received !== null && received.hand === view?.handCount ? received : null;
  const [heroDraft, setHeroDraft] = useState<readonly TilePlay[]>([]);
  const lastDraftWindowHand = useRef<number | null>(null);
  const [refusal, setRefusal] = useState<WordRejectionReason | null>(null);
  // The hero's own move, shown the instant it is tapped and kept only until the server's own
  // broadcast catches up — the server always wins on reconcile (AGENTS.md). A move never sticks:
  // it is tagged with the table id it was made against and dropped the moment that id moves, and a
  // rejection drops it too, so the row can never sit disabled behind an action the server refused.
  const [pending, setPending] = useState<Pending | null>(null);
  const onRejectRef = useRef(onReject);
  useEffect(() => {
    onRejectRef.current = onReject;
  }, [onReject]);

  const viewId = view === null ? null : idOf(view);
  const viewIdRef = useRef(viewId);
  useEffect(() => {
    viewIdRef.current = viewId;
  }, [viewId]);

  // Reconcile: the authoritative broadcast has moved past the optimistic move, so the prediction
  // is spent. A betting move clears when the table id it was made against changes; a confirmed
  // word clears when the server's own confirmation lands or the window closes. Cleared in render,
  // so the felt never shows a frame of both the prediction and the truth it reconciles to.
  if (pending !== null) {
    const spent =
      pending.kind === "betting"
        ? pending.viewId !== viewId
        : priv?.word.status === "confirmed" || view?.word?.status !== "open";
    if (spent) setPending(null);
  }

  // The hand this device is on: a fresh deal clears the draft the last hand left behind, so the
  // strip does not open the new hand holding the old word. Reset as the hand changes, in render —
  // the same way the felt re-seeds its raise amount when the bounds move — rather than in an
  // effect a frame later, so the new hand never renders once holding the old word.
  const handCount = view?.handCount ?? 0;
  const [draftHand, setDraftHand] = useState(handCount);
  if (draftHand !== handCount) {
    setDraftHand(handCount);
    setHeroDraft([]);
    setRefusal(null);
  }

  useEffect(() => {
    const handleState = (state: unknown) => setView(decodeRoom(state));
    const handlePrivate = (payload: unknown) => setPriv(decodePrivate(payload));
    const handleRejected = (payload: unknown) => {
      if (!isGameRejectionEvent(payload)) return;
      // A power refusal answers a power gesture, not the seat's move or word; the power UI takes
      // it up when the online table deals powers (STO-500).
      if (payload.action === "pickPower" || payload.action === "usePowerUp") return;
      // The server refused the move: drop the prediction so the row comes back for another try,
      // and — for a word — say why while the seat still has time to fix it.
      setPending(null);
      if (payload.action !== "betting") setRefusal(payload.reason);
      onRejectRef.current?.(payload);
    };

    // The room already holds the synced state by the time the felt mounts; read it once, then
    // follow every patch. `onStateChange` only fires on the next patch, so the first read is
    // what fills the table before anything changes.
    handleState(room.state);
    room.onStateChange(handleState);
    const offPrivate = room.onMessage(GAME_EVENTS.privateState, handlePrivate);
    const offRejected = room.onMessage(GAME_EVENTS.rejected, handleRejected);

    return () => {
      room.onStateChange.remove(handleState);
      offPrivate();
      offRejected();
    };
  }, [room]);

  // A draft can be built while the seats are betting, before the server opens §19's window.
  // Send that existing draft once when the window opens; edits made after that are sent by setDraft.
  const wordWindowHand = view?.word?.status === "open" ? view.handCount : null;
  useEffect(() => {
    if (wordWindowHand === null) {
      lastDraftWindowHand.current = null;
      return;
    }

    if (lastDraftWindowHand.current === wordWindowHand) return;
    lastDraftWindowHand.current = wordWindowHand;
    if (heroDraft.length === 0) return;

    room.send(GAME_MESSAGES.draftWord, { submission: { plays: [...heroDraft] } });
  }, [heroDraft, room, wordWindowHand]);

  // One dispatch path for every betting move: send it, then predict it — the row goes dark and the
  // seat wears the move's pill at once, against the table id it was made on, so a tap reads as done
  // before the round trip. The engine's bounds already disabled anything the server would refuse.
  const dispatchBetting = useCallback(
    (action: OnlineBettingAction, pill: OptimisticPill) => {
      room.send(GAME_MESSAGES.betting, action);
      if (viewIdRef.current !== null) setPending({ kind: "betting", pill, viewId: viewIdRef.current });
    },
    [room],
  );

  const bet = useCallback(
    (amount: number) => dispatchBetting({ type: "bet", amount }, "raise"),
    [dispatchBetting],
  );
  const raiseTo = useCallback(
    (amount: number) => dispatchBetting({ type: "raise", amount }, "raise"),
    [dispatchBetting],
  );
  const fold = useCallback(() => dispatchBetting({ type: "fold" }, "fold"), [dispatchBetting]);
  const check = useCallback(() => dispatchBetting({ type: "check" }, "check"), [dispatchBetting]);
  const call = useCallback(() => dispatchBetting({ type: "call" }, "call"), [dispatchBetting]);
  const allIn = useCallback(() => dispatchBetting({ type: "allIn" }, "all-in"), [dispatchBetting]);

  /**
   * Replaces the hero's draft with the one the seat has built and judges it for the live preview,
   * exactly as offline. A draft the tiles cannot build (§10) is refused and the previous one
   * kept; anything the tiles can build becomes the draft, and once §19's window is open it is
   * dispatched to the room so the server's own draft record follows the seat's edits (STO-397).
   */
  const setDraft = useCallback(
    (next: readonly TilePlay[]) => {
      const available = availableFor(priv, view);
      const resolution = resolveSubmission({ available, submission: { plays: [...next] } });
      if (!resolution.ok && isUnbuildable(resolution.reason)) {
        setRefusal(resolution.reason);
        return;
      }

      setHeroDraft(next);
      setRefusal(null);
      if (view?.word?.status === "open") {
        room.send(GAME_MESSAGES.draftWord, { submission: { plays: [...next] } });
      }
    },
    [priv, room, view],
  );

  const confirmWord = useCallback(() => {
    if (heroDraft.length === 0 || view?.word?.status !== "open") return;
    room.send(GAME_MESSAGES.confirmWord, { submission: { plays: [...heroDraft] } });
    // Lock the builder the instant the word is confirmed, so the check cannot fire twice while the
    // server's own confirmation is on the wire; it clears when that confirmation lands.
    if (viewIdRef.current !== null) setPending({ kind: "confirm", viewId: viewIdRef.current });
  }, [heroDraft, room, view]);

  const checkWord = useCallback(() => {
    if (
      view === null ||
      view.phase === WAITING_PHASE ||
      view.phase === "payout" ||
      priv === null ||
      heroDraft.length < 2 ||
      heroDraft.length > 7 ||
      priv.wordCheck.checksRemaining <= 0
    ) {
      return;
    }
    room.send(GAME_MESSAGES.checkWord, { submission: { plays: [...heroDraft] } });
  }, [heroDraft, priv, room, view]);

  const pendingPill = pending?.kind === "betting" ? pending.pill : null;
  const pendingConfirm = pending?.kind === "confirm";

  const perspective = useMemo(
    () => (view === null ? null : perspectiveOf(view, priv, heroId, dictionary)),
    [dictionary, heroId, priv, view],
  );
  const hero = useMemo(
    () =>
      perspective === null
        ? null
        : heroView(perspective, { draft: heroDraft, refusal, pendingPill, pendingConfirm }),
    [heroDraft, pendingConfirm, pendingPill, perspective, refusal],
  );
  const game = hero?.game ?? null;

  // The paid-out hand as the results screen draws it, off the room's own reveal. Live only while
  // the table sits on its payout: the next deal clears the broadcast's result, and with it this.
  const results = useMemo<ResultsSnapshot | null>(() => {
    if (view?.phase !== "payout" || view.result === null || game === null) return null;
    return buildSettledSnapshot(
      {
        hand: view.handCount,
        // The room's seed derives every hand it deals next, so it never leaves the server.
        seed: null,
        pot: view.result.pot,
        winner: view.result.winner,
        table: {
          players: view.seats.filter((seat) => !seat.sittingOut).length,
          folded: view.seats.filter((seat) => seat.folded).length,
        },
        standings: view.result.standings.map((standing) => ({
          playerId: standing.playerId,
          seat: standing.seat,
          place: standing.place,
          score: standing.score,
          word: standing.word === "" ? null : standing.word,
          reason: standing.reason,
          played:
            standing.tiles.length === 0
              ? null
              : {
                  tiles: standing.tiles,
                  base: standing.base,
                  mult: standing.mult,
                  rack: standing.rack,
                  total: standing.score,
                },
        })),
      },
      game.players,
    );
  }, [game, view]);

  // The row's two shared controls, bound at the tap to whatever move the row is armed for.
  const betting = game?.betting ?? null;
  const primary = useCallback(
    () => feltControls(betting, { confirm: confirmWord, check, call, bet, raiseTo }).primary(),
    [bet, betting, call, check, confirmWord, raiseTo],
  );
  const wager = useCallback(
    (amount: number) => feltControls(betting, { confirm: confirmWord, check, call, bet, raiseTo }).wager(amount),
    [bet, betting, call, check, confirmWord, raiseTo],
  );

  const setReady = useCallback(
    (ready: boolean) => room.send(GAME_MESSAGES.ready, { ready }),
    [room],
  );
  const waiting = useMemo(() => {
    if (view === null || view.phase !== WAITING_PHASE) return null;
    return {
      ready: view.seats.filter((seat) => seat.ready).length,
      seated: view.seats.length,
      heroReady: view.seats.some((seat) => seat.playerId === heroId && seat.ready),
    };
  }, [heroId, view]);

  return {
    game,
    results,
    // No hand, no word: the waiting felt draws the table with nothing to build.
    words: waiting === null ? (hero?.words ?? null) : null,
    wordCheck:
      hero?.wordCheck ?? priv?.wordCheck ?? { checksRemaining: 0, result: null },
    phase: view?.phase ?? WAITING_PHASE,
    waiting,
    setReady,
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
  };
}

/** The seats in the engine's own order — sorted by seat number, as the room dealt them. */
function engineOrder(seats: readonly SeatView[]): readonly SeatView[] {
  return [...seats].sort((a, b) => a.seat - b.seat);
}

/** The tiles the hero may build from: its private rack and the revealed community (§10). */
function availableFor(priv: PrivateView | null, view: RoomView | null): readonly Tile[] {
  return [...(priv?.rack ?? []), ...(view?.community ?? [])];
}

/**
 * The room as the Hero View reads it: the broadcast seats in engine order, placed on the felt by
 * their seat number, and the hero's turn and word slot off the seat's own private message.
 *
 * The waiting room draws too: the seats that have sat down, around an empty felt, each wearing
 * READY once it has said so. It is read as a table on preflop with no turn, no board and no rack
 * — the screen's `waiting` mode is what names it and swaps the betting row out.
 */
function perspectiveOf(
  view: RoomView,
  priv: PrivateView | null,
  heroId: PlayerId,
  dictionary: Dictionary,
): HeroPerspective | null {
  const waiting = view.phase === WAITING_PHASE;
  const phase = waiting ? "preflop" : roundPhaseOf(view.phase);
  if (phase === null) return null;

  const seats = engineOrder(view.seats).map((seat) => {
    const isHero = seat.playerId === heroId;
    return {
      id: seat.playerId,
      stack: seat.tableStack,
      committedRound: seat.committedRound,
      committedHand: seat.committedHand,
      folded: seat.folded,
      allIn: seat.allIn,
      sittingOut: seat.sittingOut,
      actedThisRound: seat.actedThisRound,
      place: seat.seat,
      // Anonymous seats until identity lands (Epic B): the hero is unnamed so the felt's "· YOU"
      // badge is the only word on it, opponents are numbered by their seat.
      name: isHero ? "You" : `Seat ${seat.seat + 1}`,
      initials: isHero ? "YOU" : `S${seat.seat + 1}`,
      color: colors.players[seat.seat % colors.players.length] ?? palette.amber400,
    };
  });
  const heroWord = priv?.word.status;
  const ordered = engineOrder(view.seats);
  const lastActions = waiting
    ? new Map(
        ordered.flatMap((seat, index) => (seat.ready ? [[index, "ready" as const] as const] : [])),
      )
    : undefined;

  return {
    id: idOf(view),
    handId: `online-hand-${view.handCount}`,
    // The chip layer's flights are the offline adapter's only, so far: the room's felt draws none.
    flights: [],
    ...(lastActions ? { lastActions } : {}),
    phase,
    seatCount: feltSeatCount(view.maxSeats),
    seats,
    heroIndex: seats.findIndex((seat) => seat.id === heroId),
    actingIndex: view.toActSeat,
    dealerIndex: view.dealerSeat,
    heroToAct: priv?.isYourTurn === true,
    // The wire's `minRaise` is already `max(lastRaiseSize, bigBlind)`, and the engine's raise
    // floor is `currentBet + max(lastRaiseSize, bigBlind)`, so passing it as `lastRaiseSize`
    // reproduces the same floor the server used.
    round:
      view.betting === null
        ? null
        : { currentBet: view.betting.currentBet, lastRaiseSize: view.betting.minRaise },
    blinds: { smallBlind: view.blinds.smallBlind, bigBlind: view.betting?.bigBlind ?? view.blinds.bigBlind },
    community: view.community,
    privateTiles: priv?.rack ?? [],
    available: availableFor(priv, view),
    word: {
      open: view.word?.status === "open",
      hero: heroWord === undefined || heroWord === "none" ? null : heroWord,
      confirmedPlays: priv?.word.confirmed ?? null,
    },
    wordCheck: priv?.wordCheck ?? {
      checksRemaining: 0,
      result: null,
    },
    result: view.result,
    sidePots: view.pots.slice(1),
    // The server owns the session's end (§27/§28); the online felt plays on until it says so.
    sessionOver: false,
    dictionary,
  };
}

/** The table's phase as a round phase, or null while it is still the waiting room. */
function roundPhaseOf(phase: RoomPhase): RoundPhase | null {
  return (ROUND_PHASES as readonly string[]).includes(phase) ? (phase as RoundPhase) : null;
}

/** The felt draws 4–6 seats; clamp a smaller or larger table into that range. */
function feltSeatCount(maxSeats: number): 4 | 5 | 6 {
  return Math.min(MAX_FELT_SEATS, Math.max(MIN_FELT_SEATS, maxSeats)) as 4 | 5 | 6;
}

/* ---------------------------------------------------------------------------------------------
 * Decoding: the broadcast schema and the private message are Colyseus values that mutate in
 * place, so each is copied into a plain snapshot a React render can compare by reference.
 * ------------------------------------------------------------------------------------------- */

function decodeRoom(state: unknown): RoomView | null {
  if (!isRecord(state) || !isRecord(state.table)) return null;
  const table = state.table;
  const betting = isRecord(state.betting) ? state.betting : null;
  const word = isRecord(state.wordWindow) ? state.wordWindow : null;
  const result = isRecord(state.result) ? state.result : null;

  return {
    phase: (state.phase as RoomPhase) ?? WAITING_PHASE,
    handCount: numberOf(state.handCount),
    maxSeats: numberOf(table.maxSeats),
    blinds: { smallBlind: numberOf(table.smallBlind), bigBlind: numberOf(table.bigBlind) },
    dealerSeat: sentinelSeat(state.dealerSeat),
    toActSeat: sentinelSeat(state.toActSeat),
    seats: decodeSeats(state.seats),
    community: iterate(state.community).map(decodeTile),
    betting:
      betting?.active === true
        ? {
            currentBet: numberOf(betting.currentBet),
            minRaise: numberOf(betting.minRaise),
            bigBlind: numberOf(betting.bigBlind),
          }
        : null,
    pots: iterate(state.pots).map((pot) => numberOf((pot as Record<string, unknown>).amount)),
    word:
      word?.status === "open" || word?.status === "settled"
        ? { status: word.status, slots: iterate(word.slots).map(decodeWordSlot) }
        : null,
    result:
      result?.available === true
        ? {
            winner: stringOf(result.winner),
            standings: iterate(result.standings).map(decodeStanding),
            pot: iterate(result.pots).reduce<number>(
              (total, pot) => total + numberOf(isRecord(pot) ? pot.amount : 0),
              0,
            ),
          }
        : null,
  };
}

function decodeSeats(seats: unknown): readonly SeatView[] {
  const out: SeatView[] = [];
  // A `MapSchema` iterates its values; a plain object (a test fake) iterates its own values too.
  for (const value of mapValues(seats)) {
    if (!isRecord(value)) continue;
    out.push({
      seat: numberOf(value.seat),
      playerId: stringOf(value.playerId),
      connected: value.connected === true,
      tableStack: numberOf(value.tableStack),
      committedRound: numberOf(value.committedThisRound),
      committedHand: numberOf(value.committedThisHand),
      allIn: value.isAllIn === true,
      folded: value.hasFolded === true,
      sittingOut: value.sittingOut === true,
      actedThisRound: value.actedThisRound === true,
      ready: value.ready === true,
    });
  }
  return out;
}

function decodeWordSlot(value: unknown): WordSlotView {
  const record = isRecord(value) ? value : {};
  const status = stringOf(record.status);
  return {
    playerId: stringOf(record.playerId),
    status: status === "confirmed" || status === "timed-out" ? status : "drafting",
  };
}

function decodeStanding(value: unknown): ResultStandingView {
  const record = isRecord(value) ? value : {};
  return {
    playerId: stringOf(record.playerId),
    seat: numberOf(record.seat),
    score: numberOf(record.score),
    place: numberOf(record.place),
    word: stringOf(record.word),
    // The schema spells "no reason" as an empty string; the reasons themselves are the engine's.
    reason: stringOf(record.reason) === "" ? null : (stringOf(record.reason) as WordRejectionReason),
    tiles: iterate(record.tiles).map(decodeTile),
    base: numberOf(record.base),
    mult: numberOf(record.mult),
    rack: numberOf(record.rack),
  };
}

/** Rebuild a domain `Tile` from the flat `TileState` the schema broadcasts (inverse of the server). */
function decodeTile(value: unknown): Tile {
  const record = isRecord(value) ? value : {};
  const id = stringOf(record.id);
  const letter = stringOf(record.letter);
  const points = numberOf(record.points);
  const raw = stringOf(record.multiplier);
  const multiplier: LetterMultiplier | undefined =
    raw === "double-letter" || raw === "triple-letter" ? raw : undefined;
  const base: LetterTile = {
    id,
    letter,
    points,
    ...(multiplier !== undefined ? { multiplier } : {}),
  };

  if (record.kind === "choice") {
    return {
      ...base,
      alternativeLetter: stringOf(record.alternativeLetter),
      alternativePoints: numberOf(record.alternativePoints),
    };
  }
  return base;
}

function decodePrivate(payload: unknown): PrivateView | null {
  if (!isRecord(payload)) return null;
  const word = isRecord(payload.word) ? payload.word : {};
  const wordCheck = isRecord(payload.wordCheck) ? payload.wordCheck : null;
  const status = stringOf(word.status);
  const confirmed = isRecord(word.confirmed) ? word.confirmed : null;

  return {
    hand: numberOf(payload.hand),
    rack: iterate(payload.rack).map(decodeTile),
    isYourTurn: payload.isYourTurn === true,
    wordCheck: {
      checksRemaining:
        wordCheck === null
          ? 0
          : Math.min(WORD_CHECKS_PER_HAND, Math.max(0, numberOf(wordCheck.checksRemaining))),
      result: decodeWordCheckResult(wordCheck?.result),
    },
    word: {
      status:
        status === "drafting" || status === "confirmed" || status === "timed-out"
          ? status
          : "none",
      confirmed:
        confirmed !== null ? iterate(confirmed.plays).map(decodePlay) : null,
    },
  };
}

function decodeWordCheckResult(value: unknown): WordCheckResult | null {
  if (!isRecord(value) || !isWordSubmission(value.submission) || typeof value.valid !== "boolean") {
    return null;
  }
  if (value.valid && typeof value.points !== "number") return null;

  const submission: WordSubmission = {
    plays: value.submission.plays.map((play) => decodePlay(play)),
  };
  return {
    submission,
    word: stringOf(value.word),
    valid: value.valid,
    points: value.valid ? numberOf(value.points) : null,
  };
}

function decodePlay(value: unknown): TilePlay {
  const record = isRecord(value) ? value : {};
  return {
    tileId: stringOf(record.tileId),
    ...(typeof record.chosenFace === "string" ? { chosenFace: record.chosenFace } : {}),
  } as TilePlay;
}

/** The schema uses -1 for "no seat"; the felt reads null. */
function sentinelSeat(value: unknown): number | null {
  const seat = numberOf(value);
  return seat < 0 ? null : seat;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Iterate an `ArraySchema` or a plain array the same way. */
function iterate(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && typeof (value as { forEach?: unknown }).forEach === "function") {
    const out: unknown[] = [];
    (value as { forEach: (cb: (item: unknown) => void) => void }).forEach((item) => out.push(item));
    return out;
  }
  return [];
}

/** Iterate a `MapSchema`'s values, or a plain object's own values (a test fake). */
function mapValues(value: unknown): readonly unknown[] {
  if (isRecord(value) && typeof (value as { values?: unknown }).values === "function") {
    return [...(value as { values: () => Iterable<unknown> }).values()];
  }
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  return [];
}
