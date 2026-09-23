/**
 * results-snapshot.ts — the settled hand, mapped into the results screen's payload.
 *
 * The mapper, not the screen: every number it carries is the engine's own. §7's score comes
 * from `scoreWord` on the seat's confirmed submission and §21's order from `rankShowdown`'s
 * standings, read off the settled window the engine keeps after the hand has paid out — the
 * reveal's record of what each seat submitted. The screen that renders this never adds up a
 * total, never re-ranks a field, and never looks at the table again (STO-380).
 *
 * The tiles are physical and in word order: the reveal's resolutions name the tile behind
 * every letter, and this looks each one up in the tiles that seat actually built from, so a
 * choice tile arrives as the one tile it is rather than as two letters (STO-379 decision 6).
 */

import type { PlayerId, Tile } from "@wordpoker/contracts";
import {
  availableTiles,
  evaluateWord,
  handSeed,
  scoreWord,
  type OfflineStanding,
  type OfflineState,
} from "@wordpoker/game-rules";

import type { GamePlayer } from "@/components/screens/game/game-types";
import { colors } from "@/constants/theme";

import { resultsHeadline, resultsSummary } from "./results-copy";
import type { ResultsSeat, ResultsSnapshot } from "./results-types";

/** What the mapper reads: the settled engine state, and the seats as the felt draws them. */
export interface ResultsSnapshotSource {
  state: OfflineState;
  /** The felt's own roster, in seat order — the same identity the table renders (STO-380). */
  players: readonly (GamePlayer | null)[];
}

/**
 * The hand's payoff as one frozen payload, or `null` while there is no settled hand to show.
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

  const revealed = result.standings.length > 0;
  const seats = revealed
    ? result.standings.map((standing) => seatResult(standing, state, players))
    : [foldOutResult(result.winner, state, players)];

  const pieces = {
    hand: state.hand,
    // The hand's own seed, not the session's: every later hand derives from it (`handSeed`),
    // so this is the one number a rating needs to replay the hand it is about.
    seed: handSeed(state),
    // The pot is the pots' own arithmetic (§25): the layers the hand built, added up.
    pot: result.payout.pots.reduce((total, pot) => total + pot.amount, 0),
    revealed,
    table: {
      players: state.seats.length,
      folded: state.seats.filter((seat) => seat.folded).length,
    },
    seats,
  };

  return {
    ...pieces,
    headline: resultsHeadline(pieces),
    summary: resultsSummary(pieces),
  };
}

/** One revealed seat: §21's place, plus what its word was worth (§7) and the tiles it played. */
function seatResult(
  standing: OfflineStanding,
  state: OfflineState,
  players: readonly (GamePlayer | null)[],
): ResultsSeat {
  const word = playedWord(state, standing.seat);

  return {
    playerId: standing.playerId,
    ...identity(players[standing.seat], standing.playerId, standing.seat),
    word: standing.word,
    tiles: word?.tiles ?? [],
    base: word?.base ?? 0,
    mult: word?.mult ?? 0,
    rack: word?.rack ?? 0,
    total: word?.total ?? standing.score,
    place: standing.place,
    // The top place is what the pot paid: a split pot is several seats sharing it (§21.3, §25).
    takesPot: standing.place === 1,
    reason: standing.reason,
  };
}

/**
 * §26's fold-out: one seat left un-folded took every pot with no reveal at all, so its card
 * carries no word and no score — the hand ended before either was asked for.
 */
function foldOutResult(
  winner: PlayerId,
  state: OfflineState,
  players: readonly (GamePlayer | null)[],
): ResultsSeat {
  const seat = state.seats.findIndex((candidate) => candidate.id === winner);

  return {
    playerId: winner,
    ...identity(players[seat], winner, seat),
    word: null,
    tiles: [],
    base: 0,
    mult: 0,
    rack: 0,
    total: 0,
    place: 1,
    takesPot: true,
    reason: null,
  };
}

/** What one seat's confirmed word resolved to: §7's three numbers, its total, and its tiles. */
interface PlayedWord {
  readonly tiles: readonly Tile[];
  readonly base: number;
  readonly mult: number;
  readonly rack: number;
  readonly total: number;
}

/**
 * §7's breakdown for one seat, re-resolved from the submission the settled window kept.
 *
 * Base is the letters' printed values, Mult is what their tiles' multipliers added, and Rack
 * is the bonus for a full rack — `base + mult + rack` is the score §21 ranked the seat by, so
 * the parts and the total can never disagree about the same word.
 */
function playedWord(state: OfflineState, seat: number): PlayedWord | null {
  const slot = state.wordWindow?.slots.find((candidate) => candidate.seat === seat);
  if (slot?.status !== "confirmed") return null;

  const available = availableTiles(state, seat);
  const evaluation = evaluateWord({
    available,
    submission: slot.submission,
    dictionary: state.dictionary,
  });
  if (!evaluation.valid) return null;

  const score = evaluation.score ?? scoreWord(evaluation.tiles);
  const tiles = new Map(available.map((tile) => [tile.id, tile]));

  return {
    tiles: evaluation.tiles.flatMap((played) => {
      const tile = tiles.get(played.tileId);
      return tile === undefined ? [] : [tile];
    }),
    base: score.letters.reduce((total, letter) => total + letter.baseValue, 0),
    mult: score.letters.reduce((total, letter) => total + (letter.value - letter.baseValue), 0),
    rack: score.fullRackBonus,
    total: score.total,
  };
}

/** The avatar colour a seat wears on the felt, for a roster entry the felt did not map. */
function identity(
  player: GamePlayer | null | undefined,
  playerId: PlayerId,
  seat: number,
): Omit<ResultsSeat, "playerId" | "word" | "tiles" | "base" | "mult" | "rack" | "total" | "place" | "takesPot" | "reason"> {
  return {
    name: player?.name ?? playerId,
    initials: player?.initials ?? playerId.slice(0, 2).toUpperCase(),
    color: player?.color ?? colors.players[seat % colors.players.length] ?? colors.gold,
    isYou: player?.isHero === true,
  };
}
