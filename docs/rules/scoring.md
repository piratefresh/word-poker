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

The bag the engine deals from holds **100 tiles**: 98 single-letter tiles in the standard
English distribution, plus two two-letter choice tiles. Counts below are what the engine
builds; the bag is shuffled with an injected seed, so the same seed deals the same hand.

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
| A/E  | A or E  |     1 |      1 | Two-letter choice tile — plays as A or E, worth the higher letter    |
| T/S  | T or S  |     1 |      2 | Two-letter choice tile — plays as T or S, worth the higher letter    |

**Total: 100 tiles** (98 single-letter + 2 two-letter).

Because the two-letter tiles are bag members like any other, a hand can show at most two
of them, which satisfies the "never more than three" rule in
[Two-Letter Tiles](tiles.md) without a separate placement rule.

<!-- TBD: the tiles doc also describes fixed two-letter sequence tiles (TH, ER) and lets the
     two-letter placement vary per hand ("usually one private, usually one community,
     occasionally a third"). A fixed-sequence tile needs a second field on the tile
     contract, and the placement policy needs a generation step; both land with the
     word-scoring epic, not this slice. -->

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

The multiplier applies to every letter printed on that tile.

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

A two-letter tile still counts as one tile for the Full Rack Bonus.

The player's submitted word may contain more than seven letters only when two-letter tiles are present, but every physical tile must be used to receive the Full Rack Bonus.

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

Recommended starting configuration:

- Approximately 15% chance for a tile to become a Double Letter tile
- Triple Letter tiles should be significantly rarer
- High-value letters may receive a slightly higher chance of becoming special tiles

The final probabilities should be configurable for balance testing.

## Multiplier Rules

- A multiplier belongs to the physical tile.
- The multiplier is visible to the tile's owner or to everyone when it is a community tile.
- The multiplier applies only when the tile is used.
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
