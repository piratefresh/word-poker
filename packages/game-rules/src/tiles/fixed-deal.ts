/**
 * fixed-deal.ts — an authored hand: the tiles a lesson names, the rest from the seed (STO-860).
 *
 * Story-mode challenges teach with a particular board — a word to find, a choice tile, a double
 * letter — which no seed can be searched into. `fixedDeal` writes those tiles down and returns
 * `dealHand`'s shape, so `startHand` plays it like any other deal. Authored letters come out of
 * the real bag (real ids, one copy each); every seat or board the spec leaves out is filled from
 * the seed's marble order of what is left. No multiplier or choice tile is rolled on top: the
 * lesson shows exactly what it wrote.
 *
 * Notation: `"R"` a plain tile, `"R:2"` / `"R:3"` a Double / Triple Letter, `"ER"` a choice tile
 * from §10's pool (`"ER:2"` doubles it).
 */

import type { LetterMultiplier, Tile } from "@wordpoker/contracts";

import { createRng } from "../core/rng";
import { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER, marbleOrder } from "./deal";
import { CHOICE_TILE_PAIRS, TWO_LETTER_TILE_LIMIT, choiceTile } from "./special-tiles";
import { createTileBag } from "./tiles";

/** The tiles a lesson names: any seat's two private tiles, and the five-tile board. */
export interface FixedDealSpec {
  hands?: Readonly<Record<number, readonly string[]>>;
  board?: readonly string[];
}

const TOKEN = /^([A-Z]{1,2})(?::([23]))?$/;
const MULTIPLIERS: Record<string, LetterMultiplier> = { "2": "double-letter", "3": "triple-letter" };

/**
 * Deals one hand from a spec, filling what it leaves out from `seed`.
 *
 * @throws {RangeError} On a seat outside the table, a hand or board of the wrong size, a token
 *   that isn't a letter or a §10 pair, a letter the bag has run out of, a pair named twice, or a
 *   seat whose seven tiles would hold more than §10's three choice tiles.
 */
export function fixedDeal({
  seed,
  playerCount,
  spec,
}: {
  seed: number;
  playerCount: number;
  spec: FixedDealSpec;
}): { privateTiles: Tile[][]; community: Tile[]; rest: Tile[] } {
  const bag = createTileBag();
  const pairs = new Set<string>();

  const take = (token: string): Tile => {
    const match = TOKEN.exec(token);
    if (match === null) throw new RangeError(`fixedDeal cannot read tile "${token}"`);
    const [, letters = "", factor] = match;
    const multiplier = factor === undefined ? undefined : MULTIPLIERS[factor];

    let tile: Tile;
    if (letters.length === 2) {
      const pair = CHOICE_TILE_PAIRS.find(([first, second]) => first + second === letters);
      if (pair === undefined) throw new RangeError(`"${letters}" is not a §10 choice pair`);
      if (pairs.has(letters)) throw new RangeError(`choice tile "${letters}" is dealt twice`);
      pairs.add(letters);
      tile = choiceTile(pair);
    } else {
      const at = bag.findIndex((candidate) => candidate.letter === letters);
      if (at < 0) throw new RangeError(`the bag has no "${letters}" left to deal`);
      [tile] = bag.splice(at, 1) as [Tile];
    }
    return multiplier === undefined ? tile : { ...tile, multiplier };
  };

  const sized = (tokens: readonly string[], size: number, what: string): Tile[] => {
    if (tokens.length !== size) throw new RangeError(`${what} needs ${size} tiles, got ${tokens.length}`);
    return tokens.map(take);
  };

  for (const seat of Object.keys(spec.hands ?? {}).map(Number)) {
    if (!Number.isInteger(seat) || seat < 0 || seat >= playerCount) {
      throw new RangeError(`seat ${seat} is not at a ${playerCount}-seat table`);
    }
  }
  const authoredHands = Array.from({ length: playerCount }, (_, seat) => {
    const tokens = spec.hands?.[seat];
    return tokens === undefined ? undefined : sized(tokens, PRIVATE_TILES_PER_PLAYER, `seat ${seat}`);
  });
  const authoredBoard = spec.board === undefined ? undefined : sized(spec.board, COMMUNITY_TILE_COUNT, "the board");

  // Everything not named comes off the leftover bag in the seed's marble order, in deal order.
  const order = marbleOrder(bag, createRng(seed));
  let next = 0;
  const draw = (count: number): Tile[] => order.slice(next, (next += count));

  const privateTiles = authoredHands.map((hand) => hand ?? draw(PRIVATE_TILES_PER_PLAYER));
  const community = authoredBoard ?? draw(COMMUNITY_TILE_COUNT);

  const isChoice = (tile: Tile): boolean => "alternativeLetter" in tile;
  const boardChoices = community.filter(isChoice).length;
  privateTiles.forEach((hand, seat) => {
    if (hand.filter(isChoice).length + boardChoices > TWO_LETTER_TILE_LIMIT) {
      throw new RangeError(`seat ${seat}'s seven tiles hold more than ${TWO_LETTER_TILE_LIMIT} choice tiles`);
    }
  });

  return { privateTiles, community, rest: order.slice(next) };
}
