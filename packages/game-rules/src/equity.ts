/**
 * equity.ts — what a hand is worth to the seat holding it: how often it wins the pots it can
 * win, and what that is expected to pay.
 *
 * A normalized word score is not a probability. §7's total says what a seat's letters are
 * worth, not how likely they are to be the best on the felt, and the two cannot be compared
 * with the price of a call: a score of 30 loses to a score of 31 and beats a score of 29, while
 * how often it does either depends on every tile still face down. So this module answers the
 * question a betting decision actually needs — *how often does this hand win* — by building
 * the worlds that are still possible and playing them out.
 *
 * ## The model
 *
 * One estimate is an average over a fixed number of worlds. A world is a complete table: every
 * seat's rack and the whole five-tile board. The tiles the seat can see are the ones it
 * actually holds — the deal is a fact, not a sample — and everything else is drawn from the
 * tiles its observation says are left:
 *
 * - **The pool is the printed bag** (§6, `./tiles`) minus the tiles the seat can see, drawn
 *   without replacement, so no two racks and no board tile can repeat a tile the seat holds
 *   and every multiplicity is respected.
 * - **Racks are the deal's size** — `PRIVATE_TILES_PER_PLAYER` each, for *every* seat at the
 *   table, folded and busted seats included, because `startHand` deals to the whole seating and
 *   their tiles are out of the bag whether or not they are still in the hand. A folded seat
 *   holds its tiles and contests nothing.
 * - **§9's multipliers are rolled** for every tile the model turns over, band for band as the
 *   deal rolls them, because a multiplier is a property of the physical tile and the seat
 *   cannot see the face-down ones.
 * - **§10's two-letter tiles** are modelled from the target the deal aims for: the target is
 *   rolled per world, the pairs the seat has *not* already seen are placed into the pool, and
 *   §10's cap of three per hand is enforced across everything the world ends up holding.
 *
 * ## What it does not model, and what that costs
 *
 * This is a **showdown-equity baseline**, as STO-361 asks for. It has no opponent model: every
 * rival is assumed to hold a legal rack, to pick its best valid word, and to have reached the
 * felt with it regardless of what it did earlier in the hand — so what comes out is how often
 * this hand wins a showdown against random racks, *not* how often it wins against the hands a
 * rival's betting says it might hold, and not a realized EV. Two further approximations are
 * worth stating plainly:
 *
 * - A pair tile is placed by adding it to the pool rather than by choosing a slot for it, so
 *   *whether* a two-letter tile is out there is modelled and *where it sits* is not; §10's cap
 *   is then enforced by redrawing a world that breaks it.
 * - The tile a placement displaces goes back to the deck in the real deal; here it is simply
 *   not dealt, which is the same thing from a seat that cannot see the deck.
 *
 * ## Pot share
 *
 * §21's ladder ranks each pot's own eligible seats, with the draw left out (`rankShowdown`'s
 * `drawTies: false`): the draw is symmetric across the seats it serves, so a group §21.1–§21.2
 * cannot separate is worth its average share — 1 for a seat that wins alone, 1/k for one tying
 * k ways, 0 for a seat that loses — which is the same expectation the draw would give, with
 * none of its variance. A seat with no valid word scores §11's 0 points and is ranked on that.
 */

import type { BettingSeatState } from "./betting";
import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER } from "./deal";
import type { Dictionary } from "./dictionary";
import { decisionSeed, type BotObservation, type BotSeatObservation } from "./observation";
import { buildPots } from "./pots";
import { createRng, mixSeed } from "./rng";
import {
  DEFAULT_SPECIAL_TILES,
  rollMultiplier,
  rollTwoLetterTarget,
  sequenceTile,
  TWO_LETTER_TILE_LIMIT,
  type SpecialTilesConfig,
} from "./special-tiles";
import { rankShowdown, type ShowdownEntry } from "./showdown";
import { createTileBag, draw, swapAt } from "./tiles";
import { evaluateBestWord } from "./word-search";

import type { Tile, WordScore } from "@wordpoker/contracts";

/**
 * How many worlds one estimate averages over.
 *
 * Measured on this machine (Windows 11, Ryzen 7 7700X, Node 24) against the shipped
 * 141,962-word list: a cold full-rack search costs ~0.4 ms and a rack already searched costs
 * nothing, so a four-seat table costs roughly 1–1.5 ms a world — about 28 ms for one decision
 * at this setting. That is the number to size against, because a decision is what a tap waits
 * for; the offline turn is 30 seconds, so the budget is not tight, and the count is fixed well
 * below what the turn would allow rather than spent for accuracy nobody is waiting on.
 *
 * The limit is worth stating too: the cost is per *decision*, and the app may take several in a
 * row — a hand the hero has folded runs every remaining bot turn inside one commit, which
 * measured 230 ms mean and 730 ms worst. That is a scheduling problem, not a sampling one, and
 * it is STO-371's. Lowering this number is the wrong lever for it: 8 worlds instead of 32 still
 * leaves a visible stall and resolves a share only to 1/8.
 *
 * A decision is a pure function of its key, so the count is part of the model: two runs at the
 * same seed sample the same worlds.
 */
export const BOT_EQUITY_SAMPLES = 32;

/** How many times a world is redrawn when §10's cap of three two-letter tiles refuses it. */
const MAX_WORLD_ATTEMPTS = 4;

/** How deep into §21.3's stream the unused draw starts. See `tieDraw` below. */
const TIE_DRAW_SALT = 0x8f1b_c3d5;

/** How the estimator's model is configured: how many worlds, and the table's special tiles. */
export interface EquityModel {
  /** How many worlds one estimate averages over. */
  readonly samples: number;
  /**
   * The table's §9/§10 settings. The default is the deal's own default, because the model has
   * to assume *some* setting and assuming the one the table plays is the only honest guess.
   */
  readonly specialTiles: SpecialTilesConfig;
}

/** The baseline model: the shipped deal's special tiles, and the measured sample budget. */
export const DEFAULT_EQUITY_MODEL: EquityModel = {
  samples: BOT_EQUITY_SAMPLES,
  specialTiles: DEFAULT_SPECIAL_TILES,
};

/** One pot's expected return for the seat (§25). */
export interface PotEquity {
  /** The chips in this layer. */
  readonly amount: number;
  /** Whether the seat may win it at all — a layer above its commitment is one it cannot. */
  readonly eligible: boolean;
  /** The share of this layer the seat is expected to be awarded, in chips. */
  readonly expected: number;
}

/**
 * What the estimate saw, for a caller checking it or reporting on it: the shape of the field
 * and how the seat's hand did against it.
 */
export interface EquityDiagnostics {
  /** Seats contesting the hand — the field the seat's word was compared against. */
  readonly contenders: number;
  /** Worlds where the seat could build no word at all (§11's 0 points). */
  readonly wordless: number;
  /** Worlds where the seat shared the main pot with an equal hand rather than taking or losing it. */
  readonly shared: number;
  /** Worlds where the main pot went to someone else outright. */
  readonly beaten: number;
  /** The mean §7 total of the seat's best word across the worlds; 0 where it had none. */
  readonly meanScore: number;
  /** The mean §7 total of the field's best word; 0 when the seat has the felt to itself. */
  readonly meanRivalScore: number;
}

/** What a seat's hand is worth, under the model {@link estimateBotEquity} documents. */
export interface BotEquity {
  /** The share of §25's main pot the seat wins on average: 1 for a sole win, 1/k for a tie, 0 for a loss. */
  readonly equity: number;
  /** The worlds this average was taken over. */
  readonly samples: number;
  /** The seat's word where it stands — its best build from what it can see, not a simulated one. */
  readonly word: string | null;
  /** §7's total for that word; 0 when it has none. A score, never a probability. */
  readonly score: number;
  /** §25's layers, each with what the seat expects to be paid from it. */
  readonly pots: readonly PotEquity[];
  /** Every layer's expectation summed: the chips the seat expects to be awarded. */
  readonly expectedPayout: number;
  readonly diagnostics: EquityDiagnostics;
}

/** What the estimator is asked: the seat's knowledge, the list that judges it, and the model. */
export interface EstimateEquityOptions {
  /** The table as the seat may see it, from `observeTable`. */
  readonly observation: BotObservation;
  readonly dictionary: Dictionary;
  /** Overrides the baseline model. */
  readonly model?: Partial<EquityModel>;
  /**
   * The chips the seat is considering committing right now.
   *
   * §25 layers the pots by what each seat has committed, so the pot a seat is deciding whether
   * to play for is the pot its *call* would put it in — an estimate layered on the table as it
   * stands would tell a seat it cannot win the chips it is being asked to pay for. The
   * projection is capped at the stack, exactly as a call is (§23).
   */
  readonly commit?: number;
}

/**
 * One world the model can see: every seat's rack, and the whole board.
 *
 * Exported alongside {@link sampleWorld} so the sampling can be checked rather than trusted:
 * what a world may hold — no tile twice, two private tiles to a seat, five on the board, §10's
 * cap on two-letter tiles — is a claim about the model, and a claim a test can read.
 */
export interface SampledWorld {
  /** One rack per seat, in seat order. The seat's own rack is the tiles it actually holds. */
  readonly racks: readonly (readonly Tile[])[];
  /** The whole board: what the streets have shown, then what the model has yet to turn over. */
  readonly board: readonly Tile[];
}

/** Whether a tile prints two letters, which is what §10's cap counts. */
function printsTwoLetters(tile: Tile): boolean {
  return "alternativeLetter" in tile || "sequenceLetter" in tile;
}

/** One pair's letters as the config prints them, which is how a placed pair is recognised. */
function pairName([first, second]: readonly [string, string]): string {
  return `${first}${second}`;
}

/** The letters already placed on the table, as pair names: a pair is placed at most once a hand. */
function placedPairs(known: readonly Tile[]): ReadonlySet<string> {
  const placed = new Set<string>();

  for (const tile of known) {
    if ("sequenceLetter" in tile) {
      placed.add(`${tile.letter}${tile.sequenceLetter}`);
    }
  }

  return placed;
}

/**
 * Deals one world from the tiles the seat cannot see.
 *
 * Everything face down is drawn here, in one pass over one pool, so the racks, the board and
 * the pairs §10 places cannot contradict each other: a tile that lands in a rival's rack is
 * not on the board, and none of them is a tile the seat is holding. The pool is the printed
 * bag minus what the seat can see, plus the sequence pairs §10's target still wants placed —
 * the pairs a seat has already been shown are the ones the deal has spent.
 */
export function sampleWorld(observation: BotObservation, model: EquityModel, rng: () => number): SampledWorld {
  const known = [...observation.privateTiles, ...observation.board];
  const knownIds = new Set(known.map((tile) => tile.id));
  const observedTwoLetter = known.filter(printsTwoLetters).length;
  const spent = placedPairs(known);
  const pairs = model.specialTiles.sequencePairs.filter((pair) => !spent.has(pairName(pair)));

  // Every seat is dealt two private tiles and the board holds five, so what is face down is
  // fixed by the table's shape — whatever the model draws, it draws exactly this many tiles.
  const faceDown =
    observation.seats.length * PRIVATE_TILES_PER_PLAYER -
    observation.privateTiles.length +
    (COMMUNITY_TILE_COUNT - observation.board.length);

  const bag = createTileBag().filter((tile) => !knownIds.has(tile.id));

  for (let attempt = 1; ; attempt += 1) {
    // §10's target for the whole hand, rolled as the deal rolls it, less the two-letter tiles
    // the seat has already seen: what the pass would still be trying to place.
    const target = rollTwoLetterTarget(model.specialTiles.twoLetterTargets, rng);
    const wanted = Math.max(
      0,
      Math.min(target - observedTwoLetter, TWO_LETTER_TILE_LIMIT - observedTwoLetter, pairs.length),
    );

    const pool = [...bag];
    const candidates = pairs.slice();
    for (let placed = 0; placed < wanted; placed += 1) {
      const chosen = swapAt(candidates, placed, placed + Math.floor(rng() * (candidates.length - placed)));
      pool.push(sequenceTile(chosen));
    }

    const { drawn } = draw(pool, faceDown, rng);
    const world = assembleWorld(observation, drawn, model.specialTiles, rng);

    // §10 caps a hand at three two-letter tiles across every seat and the board. The cap is
    // the one thing a pool-drawn rack can break that a dealt one cannot, so a world that
    // breaks it is redrawn rather than trimmed — and it is rare: the pool carries four pairs
    // at most, and the target roll asks for fewer as the seat sees more of them.
    const held = [...known, ...world.board.slice(observation.board.length), ...world.racks.flat()];
    if (attempt >= MAX_WORLD_ATTEMPTS || held.filter(printsTwoLetters).length <= TWO_LETTER_TILE_LIMIT) {
      return world;
    }
  }
}

/**
 * Lays the drawn tiles out as a table: two to every seat the seat cannot see, then the board.
 *
 * The seat's own rack is not drawn — it is the one part of the deal the seat knows, and a model
 * that resampled it would be estimating a different hand. Which of the remaining seats gets
 * which pair is exchangeable under the deal, so the draw's own order is as good as any.
 */
function assembleWorld(
  observation: BotObservation,
  drawn: readonly Tile[],
  config: SpecialTilesConfig,
  rng: () => number,
): SampledWorld {
  const racks: Tile[][] = [];
  let next = 0;

  for (const seat of observation.seats) {
    if (seat.seat === observation.seat) {
      racks.push([...observation.privateTiles]);
      continue;
    }
    racks.push(rolledFaces(drawn.slice(next, next + PRIVATE_TILES_PER_PLAYER), config, rng));
    next += PRIVATE_TILES_PER_PLAYER;
  }

  const faceDown = drawn.slice(next, next + (COMMUNITY_TILE_COUNT - observation.board.length));

  return { racks, board: [...observation.board, ...rolledFaces(faceDown, config, rng)] };
}

/**
 * Rolls §9's multiplier for the tiles the model has turned over, one roll each.
 *
 * The deal rolls a multiplier onto every physical tile it deals, in deal order; a model that
 * sampled face-down tiles and left them unmultiplied would be handing every rival a slightly
 * weaker rack than the deal does, which is a bias in the seat's own favour.
 */
function rolledFaces(tiles: readonly Tile[], config: SpecialTilesConfig, rng: () => number): Tile[] {
  return tiles.map((tile) => rollMultiplier(tile, config, rng));
}

/** The seats as the pots see them, with the seat's coming commitment already in. */
function projectedSeats(observation: BotObservation, commit: number): BettingSeatState[] {
  const chips = Math.max(0, Math.min(commit, observation.standing.stack));

  return observation.seats.map((seat) => {
    const mine = seat.seat === observation.seat;
    const committed = mine ? chips : 0;
    return {
      id: seat.playerId,
      stack: seat.stack - committed,
      committedRound: seat.committedRound + committed,
      committedHand: seat.committedHand + committed,
      folded: seat.folded,
      allIn: seat.allIn || (mine && committed >= seat.stack),
      sittingOut: seat.sittingOut,
      actedThisRound: seat.actedThisRound,
    };
  });
}

/**
 * What a seat's hand is worth, averaged over the worlds its knowledge allows.
 *
 * @throws {RangeError} When the model asks for a fraction of a world.
 */
export function estimateBotEquity({
  observation,
  dictionary,
  model,
  commit = 0,
}: EstimateEquityOptions): BotEquity {
  const full: EquityModel = { ...DEFAULT_EQUITY_MODEL, ...model };
  if (!Number.isInteger(full.samples) || full.samples < 1) {
    throw new RangeError(`an equity estimate needs a whole number of worlds, received ${full.samples}`);
  }

  const rng = createRng(decisionSeed(observation, "simulation"));
  // The ladder's own stream, named from the same decision. It is never advanced while ties are
  // left on a shared place, and a caller who configured the draw back on still replays.
  const tieDraw = createRng(mixSeed([decisionSeed(observation, "simulation"), TIE_DRAW_SALT]));

  const mine = observation.standing.seat;
  const contenders = observation.seats.filter((seat) => !seat.folded && !seat.sittingOut);
  const rivals = contenders.filter((seat) => seat.seat !== mine);
  const contenderAt = new Map(contenders.map((seat) => [seat.seat, seat]));

  // §25's layers, over the table the seat's own commitment would make: {amount, eligible}.
  const layers = buildPots(projectedSeats(observation, commit));
  /** Each layer's share for the seat, summed over the worlds. */
  const shares = layers.map(() => 0);
  /** Each layer's expected award for the seat, in chips, summed over the worlds. */
  const expected = layers.map(() => 0);

  // The seat's word where it stands, from what it has actually seen — the number it is playing
  // with now, before any world is sampled. Not a probability, and not what the estimate uses.
  const standing = evaluateBestWord({ available: observation.available, dictionary });

  let shareSum = 0;
  let wordless = 0;
  let shared = 0;
  let beaten = 0;
  let scoreSum = 0;
  let rivalSum = 0;

  for (let world = 0; world < full.samples; world += 1) {
    const sampled = sampleWorld(observation, full, rng);
    const words = new Map<number, WordScore | null>();
    let bestRival = 0;

    for (const seat of contenders) {
      const rack = sampled.racks[seat.seat] ?? [];
      const found = evaluateBestWord({ available: [...rack, ...sampled.board], dictionary });
      words.set(seat.seat, found?.score ?? null);
      if (found !== null) {
        if (seat.seat === mine) {
          scoreSum += found.score.total;
        } else {
          bestRival = Math.max(bestRival, found.score.total);
        }
      }
    }

    if (words.get(mine) === null || words.get(mine) === undefined) {
      wordless += 1;
    }
    rivalSum += bestRival;

    // The showdown the seat is actually in: every contender against every other, which is the
    // hand's win probability whether or not anyone has committed yet. §25's layers are ranked
    // separately below, and only where a layer's field differs from this one — a side pot a
    // seat cannot win is chips this number must not count.
    const field = rankShowdown({
      entries: entriesFor(contenders, words),
      rng: tieDraw,
      drawTies: false,
    });
    const fieldWinners = field.standings.filter((seat) => seat.place === 1);
    const tookField = fieldWinners.some((seat) => seat.seat === mine);

    if (tookField) {
      shareSum += 1 / fieldWinners.length;
      if (fieldWinners.length > 1) {
        shared += 1;
      }
    } else {
      beaten += 1;
    }

    layers.forEach((layer, index) => {
      // §25 ranks each layer's own eligible seats, and a layer every contender reached has the
      // same field as the showdown above — the same entries, in the same ladder, to the same
      // answer. Only a layer somebody could not reach is ranked again.
      const winners =
        layer.eligible.length === contenders.length
          ? fieldWinners
          : rankShowdown({
              entries: entriesFor(
                layer.eligible.flatMap((seat) => {
                  const contender = contenderAt.get(seat);
                  return contender === undefined ? [] : [contender];
                }),
                words,
              ),
              rng: tieDraw,
              drawTies: false,
            }).standings.filter((seat) => seat.place === 1);

      if (!winners.some((seat) => seat.seat === mine)) {
        return;
      }

      const share = 1 / winners.length;
      shares[index] = (shares[index] ?? 0) + share;
      expected[index] = (expected[index] ?? 0) + share * layer.amount;
    });
  }

  return {
    equity: shareSum / full.samples,
    samples: full.samples,
    word: standing?.word ?? null,
    score: standing?.score.total ?? 0,
    pots: layers.map((layer, index) => ({
      amount: layer.amount,
      eligible: layer.eligible.includes(mine),
      expected: (expected[index] ?? 0) / full.samples,
    })),
    expectedPayout: expected.reduce((total, one) => total + one, 0) / full.samples,
    diagnostics: {
      contenders: contenders.length,
      wordless,
      shared,
      beaten,
      meanScore: scoreSum / full.samples,
      meanRivalScore: rivalSum / full.samples,
    },
  };
}

/** One world's contested seats as the §21 ladder reads them: their standing and their word. */
function entriesFor(
  seats: readonly BotSeatObservation[],
  words: ReadonlyMap<number, WordScore | null>,
): ShowdownEntry[] {
  return seats.map((seat) => {
    const word = words.get(seat.seat);
    return {
      playerId: seat.playerId,
      seat: seat.seat,
      ...(word === null || word === undefined ? {} : { word }),
    };
  });
}
