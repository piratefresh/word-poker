/**
 * power-swap.ts — §44's Swap a Private Tile family (`docs/rules/power-ups.md`): the tile a v1 power
 * hands a seat in place of the private tile it discards.
 *
 * Every v1 power is this family, and they differ only in where the new letter comes from. The
 * module owns that and nothing else: which letter, and the plain tile it becomes. Whether the
 * seat may use its power right now — its turn, §19's window, a fold — and what the swap does to
 * the seat's rack and draft belong to the hand (`offline.ts`).
 *
 * A rolled letter comes from a stream of its own, `mixSeed(dealSeed, seat, "letter")`, never from
 * the deal's generator, and it is the stream's first roll; Mulligan's comes from the rest of the
 * bag at the seat's own index. Either way a seat's letter is fixed the moment the hand is dealt:
 * it is the same whichever street the power is used on, and a retried use cannot roll again.
 */

import type { LetterTile, PowerUpId, Tile } from "@wordpoker/contracts";

import { OfflineActionError } from "./errors";
import { LETTER_VALUES, type Letter } from "./letters";
import { createRng, mixSeed } from "./rng";

/** Random Wild's letters: all 26 of §6's faces, each equally likely. */
const ALPHABET = Object.keys(LETTER_VALUES) as Letter[];

/** Vowel Magnet's letters, each equally likely. */
const VOWELS: readonly Letter[] = ["A", "E", "I", "O", "U"];

/**
 * The letters each power draws from uniformly. Mulligan is absent: it takes a tile from the rest
 * of the hand's bag instead of rolling a letter.
 */
export const SWAP_LETTERS: Readonly<Partial<Record<PowerUpId, readonly Letter[]>>> = {
  random_wild: ALPHABET,
  vowel_magnet: VOWELS,
};

/** Where a seat's swap draws from: the seed the hand was dealt from, and the seat's index. */
export interface SwapSource {
  readonly dealSeed: number;
  readonly seat: number;
  /**
   * What the hand's deal left in the bag, in shuffled order after the community tiles
   * (`dealHand`'s `rest`). Only Mulligan reads it, so it is asked for rather than handed in.
   */
  readonly restOfBag: () => readonly Tile[];
}

/**
 * The id the new tile gets. A seat swaps at most once a hand, so the seat's index is enough to
 * keep it unique, and it can never collide with a bag tile (`A-1`) or a choice tile (`AE-1`). It
 * says nothing about the letter, so an id that reaches another seat gives nothing away.
 */
export function swappedTileId(seat: number): string {
  return `power-${seat}`;
}

/**
 * Whether a tile is one a swap handed a seat (§44): what the felt's ⚡ marker reads, in the rack
 * and at showdown. It says only that a power made the tile, never what the tile replaced.
 */
export function isSwappedTileId(tileId: string): boolean {
  return /^power-\d+$/.test(tileId);
}

/**
 * The plain tile a swap power hands the seat: its letter at §6's value, no multiplier, never a
 * choice tile, and nothing inherited from the tile it replaces.
 *
 * Mulligan's letter is the bag tile at the seat's own index in the rest of the bag: the deal laid
 * out every private and community tile up front, so that tile is one nobody else can be dealt,
 * and each seat's is a different one whatever order the seats use their powers in. Only its
 * letter is kept — the tile is rebuilt plain, under the swap's own id.
 *
 * @throws {OfflineActionError} When the bag has no tile left at the seat's index.
 */
export function swapTile(powerUpId: PowerUpId, source: SwapSource): LetterTile {
  const letter = powerUpId === "mulligan" ? bagLetter(source) : rolledLetter(powerUpId, source);

  return { id: swappedTileId(source.seat), letter, points: LETTER_VALUES[letter] };
}

/** Random Wild's and Vowel Magnet's letter: the first roll of the seat's letter stream. */
function rolledLetter(powerUpId: PowerUpId, { dealSeed, seat }: SwapSource): Letter {
  const letters = SWAP_LETTERS[powerUpId];
  if (letters === undefined) {
    throw new OfflineActionError(`${powerUpId} rolls no swap letter`);
  }

  const roll = createRng(mixSeed(dealSeed, seat, "letter"))();
  // `?? "E"` is unreachable — the roll is in [0, 1), so the index is always in range — but the
  // read is optional under `noUncheckedIndexedAccess`, so it is spelled out rather than cast.
  return letters[Math.floor(roll * letters.length)] ?? "E";
}

/** Mulligan's letter: the seat's own tile in the rest of the hand's bag. */
function bagLetter({ seat, restOfBag }: SwapSource): Letter {
  const tile = restOfBag()[seat];
  if (tile === undefined) {
    throw new OfflineActionError(`the bag has no tile left for seat ${seat}'s Mulligan`);
  }
  if (!isLetter(tile.letter)) {
    throw new OfflineActionError(`bag tile ${tile.id} prints no letter of §6's table`);
  }

  return tile.letter;
}

function isLetter(value: string): value is Letter {
  return Object.hasOwn(LETTER_VALUES, value);
}
