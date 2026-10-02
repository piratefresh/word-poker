# Choice Tiles, Word Validation & Length

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 10. Two-Letter Choice Tiles

## What Is a Choice Tile?

A choice tile is one physical tile printed with two letters, such as A/E or Q/K.

- Both letters are visible to the player.
- It counts as one tile.
- When building a word, the player plays **one** of the two letters — not both.

Every two-letter tile in Word Poker is a choice tile. There are no fixed-sequence tiles that
play both letters, and no three-letter or four-letter tiles (ADR 0005).

## Choice Tile Rules

- The player picks exactly one face each time the tile is played.
- The picked letter is the one that counts: for its point value, for word length, and for
  the Full Rack Bonus.
- The other letter is not used, not scored, and counts toward nothing.
- The tile counts as one tile, and one letter, for the Full Rack Bonus.
- A multiplier on the tile applies to the picked letter (§9).
- A choice tile may appear as a private tile or a community tile.

Players will naturally pick whichever face scores higher, unless the word they are building
only works with the lower one.

### Example

A Q/K tile plays as Q (10 points) or K (5 points).

In QUIT it plays as Q: 10 points.
In KIT it plays as K: 5 points.

If the Q/K tile has a Double Letter multiplier and plays as Q: 10 × 2 = **20 points**.

## Choice Tile Frequency

Count the seven tiles one seat can play — its two private tiles and the five community tiles.

- At most **three** of those seven are choice tiles. This cap is never crossed — every limit
  below sits under it, and a placement stops once the seat's seven reach three.
- The deal aims for **two**, preferably one private and one community, and occasionally
  deals a third.
- A seat's two private tiles may hold 0–2 choice tiles.
- The flop may hold 0–2, the turn at most one, and the river at most one.

A table may run a lower frequency (0–1 per hand) instead: [Formats](formats.md) §40.

### How the deal places them

The tile bag holds single letters only ([Letter Values, Scoring & Multipliers](scoring.md)
§6); choice tiles are placed by the deal:

- The deal draws a hand-level target and places choice tiles until the hand reaches it.
- A placement replaces the tile in the slot it lands on, and the replaced tile returns to the
  deck, so a seat still holds exactly two private tiles and the board still five.
- A placement never lets any seat's seven tiles hold more than three choice tiles.
- The pair pool and the target weights are table settings, so a table can change its choice
  tiles without touching the bag.
- Placement runs on the deal's seeded generator, so the same seed and configuration deal the
  same tiles, server and client alike.

## The Pair Pool

The default pool, one copy of each:

### Vowel Pairs

- A/E
- E/I
- O/U
- A/I

### Consonant Pairs

- T/S
- R/N
- D/T
- S/L

### High-Value Pairs

- Q/K (10 / 5)
- Z/X (10 / 8)
- J/H (8 / 5)

## Display

Choice tiles must look special: a distinct color or a subtle animation that sets them apart
from single-letter tiles.

While a word is being built, the tile must clearly show which face is picked.

<!-- Contract status: §10 ships (STO-467). The bag holds single letters only
     (`packages/game-rules/src/tiles/tiles.ts`), and the deal places the pool above from
     `packages/game-rules/src/tiles/special-tiles.ts` — one copy of each pair, with §10's per-street
     limits and the cap of three enforced seat by seat on the deal's seeded generator. The
     tile contract's two-letter shape is `ChoiceTile` alone, played face by face
     (`packages/contracts/src/tiles.ts`), and §39's read-aloud of both faces and the picked one
     is `getTileAccessibilityLabel` (`apps/mobile/src/components/game/word-tile.tsx`). -->

---

# 11. Word Validation

A submitted word must:

- Contain 2 to 7 letters
- Use only letters provided by the selected tiles
- Play exactly one face of each choice tile it uses
- Use each physical tile no more than once
- Appear in the configured dictionary
- Be submitted before the reveal timer expires

Supported dictionaries (Scrabble word lists):

- TWL
- SOWPODS

The dictionary used by a table or game mode must be displayed before joining.

## Invalid Submissions

The player receives 0 points when:

- The word is not in the selected dictionary
- The word uses unavailable letters
- A tile is used more than once
- The player submits after the timer expires
- The player submits no word

A player with an invalid word may still lose chips already committed to the pot.

A player with no valid word stays in the showdown and is ranked at 0 points: the tie-breaker
ladder places every seat, and the high-value draw settles the seats that all have none
([Betting, Pots & Tie-Breakers](betting-and-pots.md) §21).

---

# 12. Word Length

A word must contain at least 2 and at most 7 letters.

Every tile, choice tiles included, plays exactly one letter, so a word has one letter per
tile used. Seven tiles make at most a seven-letter word.

The Full Rack Bonus is based on using all seven physical tiles (§7).
