/**
 * The Hero View: the table as one seat sees it — its rack, its turn, its draft — mapped to
 * exactly what the felt draws (`GameScreenState`) and what the word builder reads (`WordDraft`).
 *
 * Both felt adapters feed this one module: `useOfflineGame` decodes the engine's own state into a
 * `HeroPerspective`, `useOnlineGame` decodes the room's broadcast and the seat's private message
 * into the same shape, and neither maps anything itself. Everything the two modes agree on — seat
 * pills, the armed action row, the live word preview, which button does what — lives here once,
 * so a fix lands in both felts or neither (STO-434 was the two copies drifting).
 *
 * Pure: no React, no clock, no room. The adapters own their sources, their dispatch and their
 * optimistic state; this only reads what they hand it.
 */

import {
  POWER_DRAW_MS,
  POWER_UPS,
  type PlayerId,
  type PowerUpId,
  type PrivateWordCheckState,
  type RoundPhase,
  type Tile,
  type TilePlay,
  type WordRejectionReason,
} from "@wordpoker/contracts";
import {
  DEFAULT_STAKES,
  OFFLINE_TURN_MS,
  WORD_WINDOW_MS,
  bettingBounds,
  resolveSubmission,
  scoreWord,
  spellSubmission,
  type BettingRoundState,
  type BettingSeatState,
  type Dictionary,
  type SubmissionResolution,
} from "@wordpoker/game-rules";

// From its own module rather than the HUD barrel: the barrel reaches the motion loop gate and
// expo-router, and this module is pure.
import { PHASE_NUMBER } from "@/components/hud/hud-types";
import type {
  BettingState,
  ChipFlight,
  GamePlayer,
  GameScreenState,
  PlayerRole,
  PlayerStatus,
} from "@/components/screens/game/game-types";
import type { SeatCount } from "@/components/table";
import type { WordDraft } from "@/components/word-builder";

/** One seat as the hero sees it: the engine's betting fields, plus how the felt draws it. */
export interface HeroSeat extends BettingSeatState {
  /** Where the felt draws the seat, `0 … seatCount − 1`. */
  place: number;
  name: string;
  initials: string;
  color: string;
}

/** The hero's slot in §19's window: still drafting, locked in, or out of time. */
export type HeroWordStatus = "drafting" | "confirmed" | "timed-out";

/** The table, decoded by an adapter into the one shape the Hero View reads. */
export interface HeroPerspective {
  /** One turn, one identity: the HUD re-anchors its countdown when this changes. */
  id: string;
  /** The hand in play, held for the whole hand: the chip layer keys its flights on it. */
  handId: string;
  /** The chips in the air over the felt; an adapter that animates none passes an empty list. */
  flights: readonly ChipFlight[];
  /**
   * What each seat did on this street, by engine index — CHECK, CALL, BET and RAISE move no flag
   * the seat carries, so the nameplate's pill can only read them from here. Absent, a seat that
   * is not acting just waits.
   */
  lastActions?: ReadonlyMap<number, PlayerStatus>;
  /**
   * The power each seat used on this street, by engine index (§44, Visibility): the nameplate
   * prints its tag beside the street's action. Absent at a Classic table.
   */
  powerTags?: ReadonlyMap<number, PowerUpId>;
  phase: RoundPhase;
  seatCount: SeatCount;
  /** In engine order — the order `bettingBounds` and the turn indices read. */
  seats: readonly HeroSeat[];
  /** The hero's engine index, or −1 when the hero holds no seat in this hand. */
  heroIndex: number;
  actingIndex: number | null;
  dealerIndex: number | null;
  /** Whether the betting turn is the hero's (the online private message says so; offline, the turn index). */
  heroToAct: boolean;
  /**
   * §44's Power Draw is open and holds the table: nobody is on the betting clock, whoever
   * pre-flop's first turn belongs to, and the HUD runs the draw's clock instead. Absent at a
   * Classic table.
   */
  powerDraw?: boolean;
  /**
   * The table's own betting-turn budget, in ms. A table that sets one says so here — the tuning
   * preview runs on a clock nobody can run out of — and one that says nothing gets the budget the
   * offline game ships with. The countdown has to read this rather than the default, or a table
   * with a longer clock would show the default running out and then sit at zero.
   */
  turnDurationMs?: number;
  /** The open betting round, or null between rounds and inside §19's window. */
  round: BettingRoundState | null;
  /**
   * The table's blinds (§5, ADR 0004): the big blind is also the table's minimum bet (§22), so it
   * is the floor and the slider's step; the small blind is the other half of §30's table
   * information.
   */
  blinds: { smallBlind: number; bigBlind: number };
  /** The board as the felt draws it: an unrevealed card is null. */
  community: readonly (Tile | null)[];
  privateTiles: readonly Tile[];
  /** The tiles the hero may build from (§10): its rack and the revealed board. */
  available: readonly Tile[];
  word: {
    /** §19's window is open. */
    open: boolean;
    /** The hero's slot in it, or null when the hero has none. */
    hero: HeroWordStatus | null;
    /** The submission the engine locked in, once confirmed. */
    confirmedPlays: readonly TilePlay[] | null;
  };
  wordCheck: PrivateWordCheckState;
  result: {
    winner: PlayerId;
    standings: readonly { playerId: PlayerId; score: number; place: number; word: string | null }[];
  } | null;
  sidePots: readonly number[];
  sessionOver: boolean;
  dictionary: Dictionary;
}

/** The pill the felt wears for a move the server has not echoed yet. */
export type OptimisticPill = "fold" | "check" | "call" | "bet" | "raise" | "all-in";

/** What only the device knows: the draft it is building, and any move still on the wire. */
export interface HeroLocal {
  draft: readonly TilePlay[];
  refusal: WordRejectionReason | null;
  /** A betting move made but not yet echoed; offline never has one. */
  pendingPill: OptimisticPill | null;
  /** The submitted bet or raise-to round total while that wager is awaiting the server. */
  pendingWagerAmount?: number;
  /** A confirm made but not yet echoed; offline never has one. */
  pendingConfirm: boolean;
}

export interface HeroView {
  game: GameScreenState;
  /** The builder's draft, or null when the hero builds no word (payout, folded, sitting out). */
  words: WordDraft | null;
  /** The hero's private check quota and most recent explicit lookup. */
  wordCheck: PrivateWordCheckState;
}

/**
 * The row when the hero has nothing to do: every control dark. `raiseStep` still carries the
 * table's step, because the slider's own arithmetic divides by it even while the slider is inert.
 */
const INERT_BETS: BettingState = {
  minRaise: 0,
  maxRaise: 0,
  raiseStep: DEFAULT_STAKES.bigBlind,
  raiseAmount: 0,
  canFold: false,
  canCheck: false,
  canRaise: false,
  canBet: false,
  canAllIn: false,
  allInAmount: 0,
  currentBet: 0,
  primary: "call",
  wager: "raise",
};

export function heroView(perspective: HeroPerspective, local: HeroLocal): HeroView {
  return {
    game: screenState(perspective, local),
    words: wordsOf(perspective, local),
    wordCheck: perspective.wordCheck,
  };
}

/** The seat's moves, as the adapter dispatches them. */
export interface HeroMoves {
  confirm: () => void;
  check: () => void;
  call: () => void;
  bet: (amount: number) => void;
  raiseTo: (amount: number) => void;
}

/**
 * The felt's two shared controls, bound to the move the row is armed for: the check/call button
 * (which §19's window turns into the confirm) and the one bet/raise slider. The row's labels read
 * the same `primary` and `wager` fields, so a tap is always the move its label names.
 */
export function feltControls(
  betting: Pick<BettingState, "primary" | "wager"> | null,
  moves: HeroMoves,
): { primary: () => void; wager: (amount: number) => void } {
  const row = betting ?? INERT_BETS;
  return {
    primary: row.primary === "confirm" ? moves.confirm : row.primary === "check" ? moves.check : moves.call,
    wager: row.wager === "bet" ? moves.bet : moves.raiseTo,
  };
}

/**
 * Whether a draft is one the tiles cannot build at all (§10), as against one that is merely
 * unfinished. An unbuildable draft is refused and the previous one kept; a partial or empty one
 * (too short, still nothing) is a word in progress the seat is allowed to hold.
 */
export function isUnbuildable(reason: WordRejectionReason): boolean {
  return (
    reason === "tile-reused" ||
    reason === "uses-unavailable-letters" ||
    reason === "too-long"
  );
}

/**
 * Everything the felt needs.
 *
 * `secondsRemaining` is the turn's full budget rather than a deadline minus now: the HUD holds a
 * budget for the length of a turn and runs it down itself, and a value that changed every second
 * would land on a new turn key every second and restart the countdown instead of counting it.
 */
function screenState(p: HeroPerspective, local: HeroLocal): GameScreenState {
  const winners = winnerIds(p.result);
  const best = p.result?.standings[0];
  const blinds = blindSeats(p.seats, p.dealerIndex);

  const players: (GamePlayer | null)[] = Array.from({ length: p.seatCount }, () => null);
  p.seats.forEach((seat, index) => {
    if (seat.place < 0 || seat.place >= p.seatCount) return;
    players[seat.place] = player(p, local, seat, index, winners, blinds);
  });

  return {
    // The draw is a turn of its own, so the countdown re-anchors on the betting clock when it
    // closes, even though pre-flop's first seat is the same one it was during the draw.
    id: p.powerDraw ? `${p.id}:power-draw` : p.id,
    handId: p.handId,
    phase: p.phase,
    phaseNumber: PHASE_NUMBER[p.phase],
    secondsRemaining: clockBudgetMs(p) / 1_000,
    seatCount: p.seatCount,
    players,
    // Every chip committed this hand, in §25's layers: the main pot first, side pots above it.
    pot: p.seats.reduce((total, seat) => total + seat.committedHand, 0),
    sidePots: p.sidePots,
    flights: p.flights,
    sessionOver: p.sessionOver,
    community: p.community,
    privateTiles: p.privateTiles,
    bestScore: best?.score,
    blinds: p.blinds,
    // The felt's "winning word" line: the ladder's top place is the word that took the pot, and
    // §11's reasons mean a seat can top the table without one (the §21.3 draw) — then there is no
    // word to show. A fold-out has no reveal at all and nothing to show (§26).
    bestWord: best?.word ? best.word : undefined,
    betting: bettingRow(p, local),
  };
}

/** The clock the HUD runs down: §44's draw, §19's window, or the betting turn. */
function clockBudgetMs(p: HeroPerspective): number {
  if (p.powerDraw) return POWER_DRAW_MS;
  if (p.word.open) return WORD_WINDOW_MS;
  return p.turnDurationMs ?? OFFLINE_TURN_MS;
}

/** Which seats the settled hand paid: the ladder's first place, or §26's one survivor. */
function winnerIds(result: HeroPerspective["result"]): readonly PlayerId[] {
  if (result === null) return [];
  if (result.standings.length === 0) return [result.winner];
  return result.standings.filter((standing) => standing.place === 1).map((standing) => standing.playerId);
}

/**
 * The action row, read off the engine's own bounds — never a legality of its own (AGENTS.md).
 * When the hero is to act, every control is exactly as legal as `bettingBounds` says; on every
 * other turn the row is inert, with one exception: §19's window, where the check is the confirm,
 * arms as soon as the hero has a draft to lock in. A move still on the wire darkens the row at
 * once, so the controls do not invite a second tap while the prediction stands.
 */
function bettingRow(p: HeroPerspective, local: HeroLocal): BettingState {
  if (local.pendingPill !== null || p.powerDraw) return INERT_BETS;

  const hero = p.seats[p.heroIndex];
  if (p.heroToAct && p.round !== null && hero !== undefined) {
    const bounds = bettingBounds(p.seats, p.round, p.heroIndex, p.blinds.bigBlind);
    if (bounds !== null) {
      return {
        minRaise: bounds.minRaiseTo,
        maxRaise: bounds.maxRaiseTo,
        raiseStep: p.blinds.bigBlind,
        raiseAmount: bounds.minRaiseTo,
        canFold: bounds.canFold,
        canCheck: bounds.canCheck,
        ...(bounds.callAmount > 0 ? { callAmount: bounds.callAmount } : {}),
        canRaise: bounds.canRaise,
        canBet: bounds.canBet,
        canAllIn: bounds.canAllIn,
        allInAmount: hero.stack,
        currentBet: bounds.currentBet,
        primary: bounds.canCheck ? "check" : "call",
        // No bet out yet opens the round with a bet; the engine refuses a raise there (§22).
        wager: bounds.canBet ? "bet" : "raise",
      };
    }
  }

  const drafting = p.word.open && p.word.hero === "drafting" && !local.pendingConfirm;
  if (!drafting || local.draft.length === 0) return INERT_BETS;
  return { ...INERT_BETS, canCheck: true, primary: "confirm" };
}

/** Which seats hold the blinds: engine indexes, or null when the table has no blind to mark. */
interface BlindSeats {
  smallBlind: number | null;
  bigBlind: number | null;
}

/**
 * The first seat at or clockwise from `from` that is dealt into the hand — the engine's own walk
 * (`offline.ts`), repeated here because the felt marks the blinds rather than being told them.
 */
function nextDealtInSeat(seats: readonly HeroSeat[], from: number): number | null {
  for (let offset = 0; offset < seats.length; offset += 1) {
    const index = (from + offset) % seats.length;
    if (seats[index]?.sittingOut === false) return index;
  }

  return null;
}

/**
 * The two blind seats (§5): the dealt-in seats clockwise from the button, with the button posting
 * the small blind heads-up. Position, not a field the state carries — what a seat does with its
 * chips is the engine's, and this only says which two nameplates the felt badges. Heads-up the
 * button is both, which is why a seat carries a list of roles rather than one.
 */
function blindSeats(seats: readonly HeroSeat[], dealerIndex: number | null): BlindSeats {
  const dealtIn = seats.filter((seat) => !seat.sittingOut).length;
  if (dealerIndex === null || dealtIn < 2) return { smallBlind: null, bigBlind: null };

  const smallBlind = dealtIn === 2 ? dealerIndex : nextDealtInSeat(seats, dealerIndex + 1);
  const bigBlind = smallBlind === null ? null : nextDealtInSeat(seats, smallBlind + 1);

  return { smallBlind, bigBlind };
}

function player(
  p: HeroPerspective,
  local: HeroLocal,
  seat: HeroSeat,
  index: number,
  winners: readonly PlayerId[],
  blinds: BlindSeats,
): GamePlayer {
  const isHero = index === p.heroIndex;
  const roles: PlayerRole[] = [];
  if (index === p.dealerIndex) roles.push("dealer");
  if (index === blinds.smallBlind) roles.push("small-blind");
  if (index === blinds.bigBlind) roles.push("big-blind");
  const power = p.powerTags?.get(index);
  const bet = isHero && (local.pendingPill === "bet" || local.pendingPill === "raise")
    ? local.pendingWagerAmount ?? seat.committedRound
    : seat.committedRound;

  return {
    id: seat.id,
    name: seat.name,
    initials: seat.initials,
    isHero,
    stack: seat.stack,
    color: seat.color,
    // The button and the two blinds ride on position (§5): the dealer marker rotates with the
    // button, and heads-up one seat holds both.
    ...(roles.length === 0 ? {} : { roles }),
    // The round total, predicted for a pending wager until the server echoes it.
    ...(bet > 0 ? { bet } : {}),
    // A power used on this street, by the catalog's tag: the result stays private (§44).
    ...(power === undefined ? {} : { powerTag: POWER_UPS[power].tag }),
    // The hero wears its just-made move the instant it is tapped; every other seat, and the hero
    // once the server echoes, reads its status straight off the table.
    status: isHero && local.pendingPill !== null ? local.pendingPill : seatStatus(p, seat, index, winners),
  };
}

function seatStatus(
  p: HeroPerspective,
  seat: HeroSeat,
  index: number,
  winners: readonly PlayerId[],
): PlayerStatus {
  // A settled hand pays its winner(s) the pill before any other state: a seat that shoved and won
  // is a winner, not "all-in".
  if (p.phase === "payout" && winners.includes(seat.id)) return "winner";
  if (seat.sittingOut) return "busted";
  if (seat.folded) return "fold";
  if (seat.allIn) return "all-in";
  if (p.phase === "payout") return "waiting";
  // Nobody is on the clock while §44's draw holds the table.
  if (p.powerDraw || p.actingIndex !== index) return p.lastActions?.get(index) ?? "waiting";
  return index === p.heroIndex ? "your-turn" : "thinking";
}

/**
 * What the word builder shows: the hero's draft, the word it spells, and whether §11 would take
 * it — the engine's own answer, computed here for the instant preview the client is allowed to
 * give itself (AGENTS.md). The payout re-judges the same submission authoritatively.
 *
 * The draft is the device's the whole hand — the builder runs in parallel with the betting — and
 * once the seat confirms, the engine's locked submission takes over. There is no draft at payout,
 * and none once the hero is out of the hand: a folded seat builds no word (§19).
 */
function wordsOf(p: HeroPerspective, local: HeroLocal): WordDraft | null {
  const hero = p.seats[p.heroIndex];
  if (p.phase === "payout" || hero === undefined || hero.folded || hero.sittingOut) return null;

  // Confirmed the moment the seat locks it in; an echo still on the wire reconciles to the same
  // answer, so the builder closes at once and the confirm cannot fire twice.
  const confirmed = local.pendingConfirm || p.word.hero === "confirmed";
  const plays = p.word.hero === "confirmed" && p.word.confirmedPlays !== null ? p.word.confirmedPlays : local.draft;
  const submission = { plays: [...plays] };
  const resolution = resolveSubmission({ available: p.available, submission });

  return {
    plays,
    // The letters the seat has typed, not the word it can stand behind: a one-tile draft has a
    // letter to show even though §12 refuses to call it a word yet.
    word: spellSubmission({ available: p.available, submission }),
    // §7 on the same resolution, so the seat watches the number move as it builds.
    score: resolution.ok ? scoreWord(resolution.tiles) : null,
    reason: local.refusal ?? previewReason(plays.length, resolution),
    confirmed,
    // The seat may build until it confirms; only §19's window lets it lock the word in.
    open: !confirmed,
    confirmable: !confirmed && p.word.open && p.word.hero === "drafting",
  };
}

/** Structural feedback only: dictionary validity stays hidden until the player taps Check. */
function previewReason(
  played: number,
  resolution: SubmissionResolution,
): WordRejectionReason | null {
  if (played === 0) return null;
  // A one-letter draft is a word in progress; the minimum length belongs to Check or confirm.
  if (!resolution.ok) return resolution.reason === "too-short" ? null : resolution.reason;
  return null;
}
