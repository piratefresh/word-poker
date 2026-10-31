/**
 * results-snapshot.ts — the settled hand, mapped into the results screen's payload.
 *
 * The mapper, not the screen: every number it carries is the engine's own. §7's score comes
 * from `playedWord` on the seat's confirmed submission and §21's order from `rankShowdown`'s
 * standings, read off the settled window the engine keeps after the hand has paid out — the
 * reveal's record of what each seat submitted. The screen that renders this never adds up a
 * total, never re-ranks a field, and never looks at the table again (STO-380).
 *
 * The tiles are physical and in word order: the reveal's resolutions name the tile behind
 * every letter, and this looks each one up in the tiles that seat actually built from, so a
 * choice tile arrives as the one tile it is rather than as two letters (STO-379 decision 6).
 *
 * Two tables settle hands — the offline engine in-process, and the room over the wire (STO-430)
 * — so both are read into one `SettledHand` first, and a single builder maps that. The online
 * room has already run `playedWord` on the server; the offline adapter runs it here.
 */

import type {
  PlayerId,
  PotResult,
  ShowdownDecider,
  StackDelta,
  Tile,
  WordRejectionReason,
} from "@wordpoker/contracts";
import { handSeed, playedWord, type OfflineState, type PlayedWord } from "@wordpoker/game-rules";

import type { GamePlayer } from "@/components/screens/game/game-types";
import { colors } from "@/constants/theme";

import { cappedCopy, potPlates, resultsHeadline, resultsSummary } from "./results-copy";
import type { ResultsSeat, ResultsSnapshot } from "./results-types";

/** One seat's place on §21's ladder, with the word it revealed and what that was worth. */
export interface SettledStanding {
  readonly playerId: PlayerId;
  /** The engine's seat index — the avatar colour's fallback when the roster has no entry. */
  readonly seat: number;
  readonly place: number;
  readonly score: number;
  readonly word: string | null;
  readonly reason: WordRejectionReason | null;
  /** §7's breakdown and the tiles played, or `null` when no word stood. */
  readonly played: PlayedWord | null;
  /** What §21's ladder decided this seat's place by. */
  readonly decidedBy: ShowdownDecider;
}

/** A paid-out hand, whichever table settled it: what the results screen is built from. */
export interface SettledHand {
  readonly hand: number;
  /** The hand's replay seed, or `null` where the table keeps it secret (online). */
  readonly seed: number | null;
  readonly pot: number;
  /** §25's layers, main pot first. */
  readonly pots: readonly Pick<PotResult, "amount" | "eligible" | "winners">[];
  /** §25's Table Stacks, before and after: what every seat's net is read from. */
  readonly stackDeltas: readonly StackDelta[];
  /** The seats dealt into the hand, in table order: how the results lay them out. */
  readonly seats: readonly SettledSeat[];
  readonly winner: PlayerId;
  readonly table: { readonly players: number; readonly folded: number };
  readonly foldedPlayerIds: readonly PlayerId[];
  /** The ladder, best first; empty for a fold-out (§26), which has no reveal. */
  readonly standings: readonly SettledStanding[];
}

/** One seat dealt into a hand, and what it committed to it. */
export interface SettledSeat {
  readonly playerId: PlayerId;
  readonly committed: number;
  readonly allIn: boolean;
}

/** What the offline mapper reads: the settled engine state, and the seats as the felt draws them. */
export interface ResultsSnapshotSource {
  state: OfflineState;
  /** The felt's own roster — the same identity the table renders (STO-380). */
  players: readonly (GamePlayer | null)[];
}

/**
 * The offline hand's payoff as one frozen payload, or `null` while there is no settled hand.
 *
 * Called once, at the moment the table reaches `payout`; the surface freezes the answer it
 * was handed, so the next hand dealing behind it cannot re-render a scoreboard mid-entrance.
 */
export function buildResultsSnapshot({
  state,
  players,
}: ResultsSnapshotSource): ResultsSnapshot | null {
  const result = state.result;
  if (result === null) return null;

  return buildSettledSnapshot(
    {
      hand: state.hand,
      // The hand's own seed, not the session's: every later hand derives from it (`handSeed`),
      // so this is the one number a rating needs to replay the hand it is about.
      seed: handSeed(state),
      // The pot is the pots' own arithmetic (§25): the layers the hand built, added up.
      pot: result.payout.pots.reduce((total, pot) => total + pot.amount, 0),
      pots: result.payout.pots,
      stackDeltas: result.payout.stackDeltas,
      seats: state.seats
        .filter((seat) => !seat.sittingOut)
        .map((seat) => ({ playerId: seat.id, committed: seat.committedHand, allIn: seat.allIn })),
      winner: result.winner,
      foldedPlayerIds: state.seats.filter((seat) => seat.folded).map((seat) => seat.id),
      table: {
        players: state.seats.length,
        folded: state.seats.filter((seat) => seat.folded).length,
      },
      standings: result.standings.map((standing) => ({
        playerId: standing.playerId,
        seat: standing.seat,
        place: standing.place,
        score: standing.score,
        word: standing.word,
        reason: standing.reason,
        played: playedWord(state, standing.seat),
        decidedBy: standing.decidedBy,
      })),
    },
    players,
  );
}

/** Any settled hand as the results screen's payload — the one builder both tables share. */
export function buildSettledSnapshot(
  settled: SettledHand,
  players: readonly (GamePlayer | null)[],
): ResultsSnapshot {
  const revealed = settled.standings.length > 0;
  // A layer only one seat could win is chips nobody called coming back, not a pot (§25).
  const contested = settled.pots.filter((pot) => pot.eligible.length > 1);
  const chips = seatChips(settled, contested, players);
  const seats = revealed
    ? settled.standings.map((standing) => seatResult(standing, contested, chips, players))
    : [foldOutResult(settled.winner, chips, players)];
  for (const playerId of settled.foldedPlayerIds) {
    seats.push({
      ...foldOutResult(playerId, chips, players),
      folded: true,
      place: 0,
      takesPot: false,
      tag: "folded",
      capped: null,
    });
  }

  const pieces = {
    hand: settled.hand,
    seed: settled.seed,
    pot: settled.pot,
    pots:
      contested.length > 1
        ? potPlates(contested, seats)
        : [{ label: "POT", amount: settled.pot, to: null }],
    revealed,
    table: settled.table,
    seats,
  };

  return {
    ...pieces,
    headline: resultsHeadline(pieces),
    summary: resultsSummary(pieces),
  };
}

type SeatChips = Pick<ResultsSeat, "seatIndex" | "net" | "committed" | "allIn" | "capped">;

/** A lookup of each seat's money and place at the table, off the hand's settlement. */
function seatChips(
  settled: SettledHand,
  contested: SettledHand["pots"],
  players: readonly (GamePlayer | null)[],
): (playerId: PlayerId) => SeatChips {
  const order = settled.seats.map((seat) => seat.playerId);
  const heroAt = order.findIndex((id) => players.some((p) => p?.id === id && p.isHero === true));
  // Nobody can lose more than the second-deepest seat matched: the excess went straight back.
  const matched = settled.seats.map((seat) => seat.committed).sort((a, b) => b - a)[1] ?? 0;

  return (playerId) => {
    const seat = settled.seats.find((candidate) => candidate.playerId === playerId);
    const delta = settled.stackDeltas.find((candidate) => candidate.playerId === playerId);
    const canWin = contested.filter((pot) => pot.eligible.includes(playerId)).length;
    const allIn = seat?.allIn ?? false;
    const isYou = order.indexOf(playerId) === heroAt;

    return {
      seatIndex: (order.indexOf(playerId) - Math.max(heroAt, 0) + order.length) % order.length,
      net: delta === undefined ? 0 : delta.end - delta.start,
      committed: Math.min(seat?.committed ?? 0, matched),
      allIn,
      capped:
        allIn && canWin > 0 && canWin < contested.length
          ? cappedCopy(isYou, canWin, contested.length)
          : null,
    };
  };
}

/** One revealed seat: §21's place, plus what its word was worth (§7) and the tiles it played. */
function seatResult(
  standing: SettledStanding,
  contested: SettledHand["pots"],
  chips: (playerId: PlayerId) => SeatChips,
  players: readonly (GamePlayer | null)[],
): ResultsSeat {
  const word = standing.played;
  const tiles: readonly Tile[] = word?.tiles ?? [];
  const seatChipsOf = chips(standing.playerId);
  const bestWord = standing.place === 1 && standing.word !== null;

  return {
    playerId: standing.playerId,
    folded: false,
    ...identity(players, standing.playerId, standing.seat),
    ...seatChipsOf,
    tag: bestWord ? "best-word" : seatChipsOf.allIn ? "all-in" : "called",
    word: standing.word,
    tiles,
    base: word?.base ?? 0,
    mult: word?.mult ?? 0,
    rack: word?.rack ?? 0,
    total: word?.total ?? standing.score,
    place: standing.place,
    // The top place took a pot, and a split is several seats sharing it (§21.3); a seat lower down
    // can still take a side pot the top place was capped out of (§25).
    takesPot:
      standing.place === 1 || contested.some((pot) => pot.winners.includes(standing.playerId)),
    reason: standing.reason,
    decidedBy: standing.decidedBy,
  };
}

/**
 * §26's fold-out: one seat left un-folded took every pot with no reveal at all, so its card
 * carries no word and no score — the hand ended before either was asked for.
 */
function foldOutResult(
  winner: PlayerId,
  chips: (playerId: PlayerId) => SeatChips,
  players: readonly (GamePlayer | null)[],
): ResultsSeat {
  return {
    playerId: winner,
    folded: false,
    ...identity(players, winner, -1),
    ...chips(winner),
    tag: null,
    word: null,
    tiles: [],
    base: 0,
    mult: 0,
    rack: 0,
    total: 0,
    place: 1,
    takesPot: true,
    reason: null,
    decidedBy: null,
  };
}

/**
 * The seat as the felt draws it, found by id — the felt places seats by where they sit, which
 * online need not be the engine's index. The seat's colour stands in for a roster it is not on.
 */
function identity(
  players: readonly (GamePlayer | null)[],
  playerId: PlayerId,
  seat: number,
): Pick<ResultsSeat, "name" | "initials" | "color" | "isYou"> {
  const player = players.find((candidate) => candidate?.id === playerId);
  return {
    name: player?.name ?? playerId,
    initials: player?.initials ?? playerId.slice(0, 2).toUpperCase(),
    color:
      player?.color ?? colors.players[Math.max(seat, 0) % colors.players.length] ?? colors.gold,
    isYou: player?.isHero === true,
  };
}
