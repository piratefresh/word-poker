# Letter Values, Scoring & Multipliers

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 6. Letter Values and Scoring

## Letter Point Values

| Points | Letters          |
| -----: | ---------------- |
|      1 | A, E, I, O, U    |
|      2 | R, S, T, L, N    |
|      3 | D, G             |
|      4 | B, C, M, P       |
|      5 | F, H, V, W, Y, K |
|      8 | J, X             |
|     10 | Q, Z             |

## Tile Bag Distribution

The bag the engine deals from holds **98 single-letter tiles** in the standard English
distribution. Counts below are what the engine builds; the bag is shuffled with an injected
seed, so the same seed deals the same hand.

| Tile | Letters | Count | Points | Notes                                                                |
| ---- | ------- | ----: | -----: | -------------------------------------------------------------------- |
| A    | A       |     9 |      1 |                                                                      |
| B    | B       |     2 |      4 |                                                                      |
| C    | C       |     2 |      4 |                                                                      |
| D    | D       |     4 |      3 |                                                                      |
| E    | E       |    12 |      1 |                                                                      |
| F    | F       |     2 |      5 |                                                                      |
| G    | G       |     3 |      3 |                                                                      |
| H    | H       |     2 |      5 |                                                                      |
| I    | I       |     9 |      1 |                                                                      |
| J    | J       |     1 |      8 |                                                                      |
| K    | K       |     1 |      5 |                                                                      |
| L    | L       |     4 |      2 |                                                                      |
| M    | M       |     2 |      4 |                                                                      |
| N    | N       |     6 |      2 |                                                                      |
| O    | O       |     8 |      1 |                                                                      |
| P    | P       |     2 |      4 |                                                                      |
| Q    | Q       |     1 |     10 |                                                                      |
| R    | R       |     6 |      2 |                                                                      |
| S    | S       |     4 |      2 |                                                                      |
| T    | T       |     6 |      2 |                                                                      |
| U    | U       |     4 |      1 |                                                                      |
| V    | V       |     2 |      5 |                                                                      |
| W    | W       |     2 |      5 |                                                                      |
| X    | X       |     1 |      8 |                                                                      |
| Y    | Y       |     2 |      5 |                                                                      |
| Z    | Z       |     1 |     10 |                                                                      |

**Total: 98 tiles**, all single-letter.

The bag holds no two-letter tiles. Choice tiles are placed by the deal from the table's
pair pool, which is where §10's frequency and its cap of three are enforced —
[Choice Tiles](tiles.md) §10.

<!-- Contract status: the bag is the 98 single-letter tiles above, with §6's values pinned to
     the table by a drift-guard test (`packages/game-rules/src/tiles.ts`, STO-467). §10's choice
     tiles are placed by the deal rather than held in the bag
     (`packages/game-rules/src/special-tiles.ts`), which is also where §9's multiplier rolls
     live. Word-building honours §10–§12 (`packages/game-rules/src/building.ts`), and scoring is
     implemented in `packages/game-rules/src/scoring.ts` (`scoreWord`, §7's per-letter
     breakdown). -->

---

# 7. Word Score Calculation

## Step 1: Calculate the Base Score

Add the values of every letter in the submitted word.

### Example: MARKET

- M = 4
- A = 1
- R = 2
- K = 5
- E = 1
- T = 2

Base Score:

4 + 1 + 2 + 5 + 1 + 2 = **15 points**

## Step 2: Apply Tile Multipliers

Individual tiles may have a score multiplier.

Possible multiplier tiles include:

- Double Letter
- Triple Letter

The multiplier applies to the letter the tile plays: on a two-letter choice tile, the face
the player picked (§10).

### Double Letter Example

A normal M is worth 4 points.

A Double Letter M is worth:

4 × 2 = **8 points**

The bonus is applied only when that tile is used in the submitted word.

### Triple Letter Example

A normal Q is worth 10 points.

A Triple Letter Q is worth:

10 × 3 = **30 points**

## Step 3: Apply the Full Rack Bonus

Using all seven available tiles awards:

**+10 points**

The seven available tiles are:

- Two private tiles
- Five community tiles

A two-letter choice tile counts as one tile, and plays one letter, for the Full Rack Bonus.

Every tile plays exactly one letter (§10), so a Full Rack word is always seven letters long.

## Final Score Formula

**Final Score = Modified Letter Score + Full Rack Bonus**

There is no timer bonus.

Finishing quickly does not increase the player's score.

---

# 8. Monster Score Example

Word: **MONSTER**

Tiles used: 7
Double Letter Tile: M

## Base Letter Values

- M = 4
- O = 1
- N = 2
- S = 2
- T = 2
- E = 1
- R = 2

Base Score:

4 + 1 + 2 + 2 + 2 + 1 + 2 = **14 points**

## Apply Double Letter M

M becomes:

4 × 2 = 8

Modified Letter Score:

8 + 1 + 2 + 2 + 2 + 1 + 2 = **18 points**

## Apply Full Rack Bonus

All seven tiles were used:

18 + 10 = **28 points**

Final Score: **28 points**

---

# 9. Multiplier Tile Generation

Each eligible tile has a chance to receive a multiplier.

The product spec recommends roughly a 15% Double Letter chance, Triple Letters
"significantly rarer", and a slightly higher chance for high-value letters; the defaults
below put numbers on that recommendation.

### How the deal rolls them

Every physical tile the deal puts on the table is eligible — private or community, single
or choice — and the roll happens once per tile at deal time, on the deal's seeded
generator (`packages/game-rules/src/special-tiles.ts`). A tile carries at most one
multiplier: §9 does not stack them.

The defaults:

- **Double Letter**: 15% per tile. A high-value tile — its highest printed face worth 5
  points or more (§6: F, H, V, W, Y, K, J, X, Q, Z) — rolls its double at 20% instead.
- **Triple Letter**: 3% per tile, read first, so a tile that triples never also doubles.
- Tiles that stay in the deck are not rolled: a multiplier belongs to a tile on the table.
- Every number here — the two chances and the high-value bump, together with §10's
  pair pool and target weights — is a table setting, so balance testing changes the
  configuration and never the code.

## Multiplier Rules

- A multiplier belongs to the physical tile.
- The multiplier is visible to the tile's owner or to everyone when it is a community tile.
- The multiplier applies only when the tile is used.
- On a choice tile, the multiplier applies to the face the player plays.
- Unused multiplier tiles provide no points.
- Multipliers do not multiply the Full Rack Bonus.
- Multipliers do not stack unless the game explicitly introduces stacked modifiers later.

Special tiles should have a distinct visual treatment, such as:

- Different border color
- Glow
- Animated shimmer
- Double or Triple badge
- Reveal animation
- Sound effect
