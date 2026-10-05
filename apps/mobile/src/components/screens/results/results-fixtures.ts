/**
 * results-fixtures.ts — one settled hand, written out for the tests that draw the results screen.
 *
 * The screen's real payload is built by `results-snapshot.ts` out of a live engine, which a card's
 * test cannot reach: the card draws a `ResultsSeat` and nothing else, so these are the seats it
 * draws. The tiles are the engine's own physical objects carrying §6's printed values, and the
 * headline and summary are built by `results-copy.ts` rather than spelled here — a fixture that
 * carried its own sentence would let the copy module and the screen drift apart unwatched
 * (STO-379 decision 12).
 *
 * The numbers are §7's arithmetic, not decoration: `base + mult + rack = total`, and the tiles'
 * multipliers are what `mult` says they are, so a card printing them can be checked by hand.
 */

import type { Tile } from "@wordpoker/contracts";

import { colors } from "@/constants/theme";

import { resultsHeadline, resultsSummary } from "./results-copy";
import type { ResultsSeat, ResultsSnapshot } from "./results-types";

/** The hand every fixture is dealt from, the design's own: `HAND #18` (STO-382's header). */
const HAND = 18;
/** What the hand's pots hold — what the pot counts up to and settles on. */
const POT = 80;
/** The seed the hand was replayed from: the number a rating sends back with a report (STO-385). */
const SEED = 20_260_919;

/**
 * One seat, with the fields a test does not name filled in sensibly: an id and initials read off
 * the name, the first accent of the player wheel, no word, no tiles, no score, last place.
 */
export function seatFixture(overrides: Partial<ResultsSeat> & { name: string }): ResultsSeat {
  const { name } = overrides;

  return {
    // The wire id and the avatar letters are read off the name: a seat is its name plus whichever
    // accent of the wheel the felt gave it, and `results-snapshot.ts` maps the same three.
    playerId: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    initials: name
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join(""),
    color: colors.players[0],
    isYou: false,
    word: null,
    tiles: [],
    base: 0,
    mult: 0,
    rack: 0,
    total: 0,
    place: 1,
    takesPot: false,
    reason: null,
    decidedBy: "final-score",
    ...overrides,
  };
}

/**
 * A whole snapshot of four seats, best first, the first one the pot's winner.
 *
 * `Ellis` wins on §7's own example of a multiplier: `ENVIRO` is 12 printed points, its
 * double-letter `V` adds 5, and the card prints 17. `Guest` is the local player's seat — third,
 * with a word — because `(you)` belongs wherever the seat placed, not only on the winner
 * (STO-381's acceptance). `Jax Rook` reached the reveal with no word at all, which is a card at
 * 0 rather than a missing card (§11, §20).
 *
 * `seats`, `table` and `revealed` are read back by this function to build the copy, so a caller
 * that overrides a seat gets a headline about the hand it actually asked for.
 */
export function snapshotFixture(overrides: Partial<ResultsSnapshot> = {}): ResultsSnapshot {
  const seats = overrides.seats ?? defaultSeats();
  const table = overrides.table ?? { players: 4, folded: 1 };
  const revealed = overrides.revealed ?? true;

  return {
    hand: overrides.hand ?? HAND,
    seed: overrides.seed ?? SEED,
    pot: overrides.pot ?? POT,
    revealed,
    table,
    seats,
    headline: overrides.headline ?? resultsHeadline({ seats, revealed }),
    summary: overrides.summary ?? resultsSummary({ seats, revealed, table }),
  };
}

/**
 * §26's fold-out: everybody but one seat folded, so the hand never reached §20's reveal and nobody
 * was asked for a word. One card, and it takes a pot it never had to spell anything for — which is
 * why its word slot has no §11 reason behind it and says `NO WORD` instead.
 *
 * Three folds, not the default one: a fold-out is what the other three seats folding means, and a
 * table with two live seats would have had a reveal, a ladder and scores of its own.
 */
export const foldOutSnapshot: ResultsSnapshot = snapshotFixture({
  revealed: false,
  table: { players: 4, folded: 3 },
  seats: [
    seatFixture({
      name: "Ellis",
      color: colors.players[3],
      takesPot: true,
    }),
  ],
});

/**
 * §21.3's draw: two seats tied on the top total share the pot, so both cards wear the gold and the
 * headline splits. A draw is one shared place — the ladder separates every pair of seats it can,
 * and this is the pair it could not.
 */
export const splitSnapshot: ResultsSnapshot = snapshotFixture({
  seats: [
    seatFixture({
      name: "Ellis",
      color: colors.players[3],
      word: "ENVIRO",
      tiles: enviroTiles(),
      base: 12,
      mult: 5,
      rack: 0,
      total: 17,
      takesPot: true,
    }),
    seatFixture({
      name: "Mira Quill",
      color: colors.players[1],
      word: "THICK",
      tiles: thickTiles(),
      base: 17,
      mult: 0,
      rack: 0,
      total: 17,
      takesPot: true,
    }),
    seatFixture({
      name: "Jax Rook",
      color: colors.players[5],
      word: "ROW",
      tiles: rowTiles(),
      base: 8,
      mult: 0,
      rack: 0,
      total: 8,
      place: 2,
    }),
  ],
});

/**
 * The card's widest legal case: SEVEN LETTERS out of seven physical tiles — §12's ceiling and
 * §7's full rack — with a name long enough to have to truncate rather than push the score off
 * the card.
 *
 * `MARKETS` is spelled by §10's `A/E` choice tile played as `A` and six single letters, which is
 * what one tile per letter buys: the longest word a hand can build is the seven tiles it holds.
 */
export const longWordSnapshot: ResultsSnapshot = snapshotFixture({
  seats: [
    seatFixture({
      name: "Aurelio Vandermeer",
      color: colors.players[3],
      word: "MARKETS",
      tiles: marketsTiles(),
      base: 17,
      mult: 0,
      rack: 10,
      total: 27,
      takesPot: true,
    }),
    seatFixture({
      name: "Mira Quill",
      color: colors.players[1],
      word: "ORGONE",
      tiles: orgoneTiles(),
      base: 10,
      mult: 0,
      rack: 0,
      total: 10,
      place: 2,
    }),
    seatFixture({
      name: "Jax Rook",
      color: colors.players[5],
      place: 3,
      reason: "timer-expired",
    }),
  ],
});

/** The hero on the top place: the winner's card is the local player's, gold, `(you)` and all. */
export const youWonSnapshot: ResultsSnapshot = snapshotFixture({
  seats: [
    seatFixture({
      name: "Guest",
      color: colors.players[2],
      isYou: true,
      word: "ENVIRO",
      tiles: enviroTiles(),
      base: 12,
      mult: 5,
      rack: 0,
      total: 17,
      takesPot: true,
    }),
    seatFixture({
      name: "Mira Quill",
      color: colors.players[1],
      word: "ORGONE",
      tiles: orgoneTiles(),
      base: 10,
      mult: 0,
      rack: 0,
      total: 10,
      place: 2,
    }),
    seatFixture({
      name: "Ellis",
      color: colors.players[3],
      word: "ROW",
      tiles: rowTiles(),
      base: 8,
      mult: 0,
      rack: 0,
      total: 8,
      place: 3,
    }),
    seatFixture({
      name: "Jax Rook",
      color: colors.players[5],
      place: 4,
      reason: "timer-expired",
    }),
  ],
});

/** The default field, best first: a winner, a runner-up, the local player, and a seat at 0. */
function defaultSeats(): ResultsSeat[] {
  return [
    seatFixture({
      name: "Ellis",
      color: colors.players[3],
      word: "ENVIRO",
      tiles: enviroTiles(),
      base: 12,
      mult: 5,
      rack: 0,
      total: 17,
      takesPot: true,
    }),
    seatFixture({
      name: "Mira Quill",
      color: colors.players[1],
      word: "ORGONE",
      tiles: orgoneTiles(),
      base: 10,
      mult: 0,
      rack: 0,
      total: 10,
      place: 2,
    }),
    seatFixture({
      name: "Guest",
      color: colors.players[2],
      isYou: true,
      word: "ROW",
      tiles: rowTiles(),
      base: 8,
      mult: 0,
      rack: 0,
      total: 8,
      place: 3,
    }),
    seatFixture({
      name: "Jax Rook",
      color: colors.players[5],
      place: 4,
      reason: "timer-expired",
    }),
  ];
}

/**
 * `ENVIRO`, and the one multiplier that makes §7's arithmetic land on the seat's 17: printed
 * `E1 N2 V5 I1 R2 O1` is 12, the double-letter `V` plays 5 × 2 and adds 5.
 */
function enviroTiles(): Tile[] {
  return [
    { id: "E-1", letter: "E", points: 1 },
    { id: "N-1", letter: "N", points: 2 },
    { id: "V-1", letter: "V", points: 5, multiplier: "double-letter" },
    { id: "I-1", letter: "I", points: 1 },
    { id: "R-1", letter: "R", points: 2 },
    { id: "O-1", letter: "O", points: 1 },
  ];
}

/** `ORGONE`: `O1 R2 G3 O1 N2 E1`, ten printed points and no multiplier. */
function orgoneTiles(): Tile[] {
  return [
    { id: "O-2", letter: "O", points: 1 },
    { id: "R-2", letter: "R", points: 2 },
    { id: "G-1", letter: "G", points: 3 },
    { id: "O-3", letter: "O", points: 1 },
    { id: "N-2", letter: "N", points: 2 },
    { id: "E-2", letter: "E", points: 1 },
  ];
}

/** `ROW`: `R2 O1 W5`, eight printed points. */
function rowTiles(): Tile[] {
  return [
    { id: "R-3", letter: "R", points: 2 },
    { id: "O-4", letter: "O", points: 1 },
    { id: "W-1", letter: "W", points: 5 },
  ];
}

/** `THICK`: `T2 H5 I1 C4 K5`, seventeen printed points — the draw's other half of 17. */
function thickTiles(): Tile[] {
  return [
    { id: "T-1", letter: "T", points: 2 },
    { id: "H-1", letter: "H", points: 5 },
    { id: "I-2", letter: "I", points: 1 },
    { id: "C-1", letter: "C", points: 4 },
    { id: "K-1", letter: "K", points: 5 },
  ];
}

/**
 * `MARKETS`, seven letters out of seven tiles: `M4 K5 R2 T2 S2`, one `E1`, and §10's `A/E`
 * choice tile played as `A` for 1. Printed values add up to 17, and using all seven physical
 * tiles adds §7.3's `+10` — the card's widest legal word.
 */
function marketsTiles(): Tile[] {
  return [
    { id: "M-1", letter: "M", points: 4 },
    { id: "AE-1", letter: "A", points: 1, alternativeLetter: "E", alternativePoints: 1 },
    { id: "R-1", letter: "R", points: 2 },
    { id: "K-1", letter: "K", points: 5 },
    { id: "E-1", letter: "E", points: 1 },
    { id: "T-1", letter: "T", points: 2 },
    { id: "S-1", letter: "S", points: 2 },
  ];
}
