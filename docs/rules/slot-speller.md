# Slot Speller

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 48. Slot Speller

Slot Speller is a solo, endless slot-machine word mode. There is no table, no betting and no
bots: the player spins a grid of letter reels, rearranges it with a few moves, and every word
the pay lines spell scores. Every number below is config
(`packages/game-rules/src/slot-speller/config.ts`), to tune after playtesting.

**Strips.** Each reel is a strip of 30 tiles. Every strip tile is drawn on its own, with
replacement, from the normal bag's letter distribution (§7), so a strip can repeat letters the
bag holds once. Strips hold no choice tiles and no Double or Triple Letter tiles: premium
cells (below) took their place. (The old rule is still config, off: `tileRates` gives each strip
tile one multiplier roll, Triple Letter first, then Double Letter with a bonus for a letter
worth 5 or more.) A run's strips come from its seed: the same seed gives the same
strips and, given the same actions, the same spins.

**Grid.** A run starts with 5 reels and 3 rows. Each reel shows 3 consecutive tiles of its
strip, wrapping from the end back to the start. Add Row adds a row (at most 5 rows).

**Premium cells.** Some cells of the grid are premium, as on a Scrabble board. They belong to
the grid, not to the tiles: a nudge or a swap moves tiles across them.

- A **letter cell** (2L, 3L) doubles or triples the tile on it.
- A **word cell** (2W, 3W) doubles or triples every paying word that covers it. Two word cells
  under one word multiply together.

Which cells a grid has comes from one pattern drawn for the full 12 × 5 board; the grid in play
has the cells of the part it covers, so a new reel or row brings its own. The pattern is
diagonals four reels apart. Rows 1, 3 and 5 hold letter cells and rows 2 and 4 word cells.
Every second diagonal's letter cells are 3L, and the third diagonal's word cell is the board's
one 3W:

| Row | Reel 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | ------ | - | - | - | - | - | - | - | - | -- | -- | -- |
| 1 | | 2L | | | | 3L | | | | 2L | | |
| 2 | | | 2W | | | | 2W | | | | 3W | |
| 3 | | | | 2L | | | | 3L | | | | 2L |
| 4 | 2W | | | | 2W | | | | 2W | | | |
| 5 | | 3L | | | | 2L | | | | 3L | | |

The starting 5 × 3 grid therefore has three cells: 2L, 2W, 2L.

The table says which cells each row has, not where they sit. When a run starts, on every spin,
and when a reel or row is bought, each row's cells land on random reels of that row, one cell
to a reel, from the run's seed. Between spins they stay put. A reel held through a spin keeps
its cells, and the row's other cells land on reels that are not held.

Premium cells count on **row lines only**. Wave and zigzag lines read the letters and ignore
the cells under them.

**Permanent cells.** Hot Cell and Jackpot Cell (Powers, below) each add a triple cell that
never moves: Hot Cell a 3L, Jackpot Cell a 3W. It lands on a random cell of the grid that has no
premium cell at the time of purchase, from the run's seed. Rolled cells never land on a
permanent cell's spot: a row's rolled cells skip the reel it sits on. A pattern cell drawn under
a permanent cell (cells fixed, a reel or row bought later) gives way to it. Permanent cells are
marked in the run's state so the grid can draw them apart. They count on row lines only, like
every premium cell, and a permanent 3W cell refuses swaps like any word cell.

A tile on a **word cell** cannot be swapped in or out: only nudging that reel changes the
letter on it.

Config (`cells`): no cells at all, cells fixed where the pattern draws them instead of moving,
which cells refuse swaps (word cells, all cells, none), the diagonal spacing and each
multiplier.

**Spins.** A spin is allowed at the start of a round or between spins, while spins are left. A
spin sends every reel to a new random place on its strip and refills its column. A
held reel keeps its column (Holds, below). A round has 3 spins; each spin
grants 4 moves (6 with Extra Move).

**Holds.** As on a fruit machine, between the spins of a round the player may hold 1 reel for
free (3 with Big Hold); tapping a held reel releases it. Holding costs no move and no token.
The next spin leaves a held reel's column as it is, swapped tiles included, and its premium
cells where they are; the row's other cells land on the reels that spin. The spin clears the
holds, so the player chooses again before the spin after it, and a new round starts with none.
Holding is refused outside the between-spins phase (so not before a round's first spin), for a
reel off the grid, and for one more reel than the limit. An Extra Spin is a spin like any
other: reels can be held for it. Config: `freeHolds` (1) and `bigHoldBonus` (2).

**Moves.** Each move costs one:

- **Nudge** a reel up or down one tile. Up drops the top tile and brings the next strip tile in
  at the bottom; down drops the bottom tile and brings the previous strip tile in at the top.
  Tiles swapped into the column ride along.
- **Swap** any two grid cells. A swap changes the grid only, never the strips.

A move is refused, with nothing changed and no move spent, when no moves are left, outside a
spin's move phase, on a cell or reel off the grid, when a swap names the same cell twice, or
when either tile of a swap sits on a word cell.

**Payout.** When the player is done moving, the grid pays: every pay line's words (below) are
scored and their total joins the round score. The run remembers its best-scoring word.

**Pay lines.** Every row is a pay line, read left to right. Wave Lines adds a line that weaves
down and up through the rows (row 1, 2, 3, 2, 1, … on three rows) and its mirror. Each Zigzag
Lines purchase pays one pair of neighbouring rows, chosen by the buyer: the two lines that
alternate between them. A cell can pay on more than one line.

**Paying a line.** Every run of 3 or more consecutive tiles on the line that spells a word is a
candidate. A blank plays any letter for 0 (a word may hold at most 2 blanks); a choice tile
plays either face; each candidate plays its highest-scoring reading. The line then pays the
best-scoring set of candidates that share no tile.

**Word score.** Base is the sum of each tile's face value, multiplied by the letter cell under
it on a row line (blanks 0, on a letter cell too). The base is then multiplied by every word
cell the word covers on a row line; a blank on a word cell still counts. The length multiplier
is:

| Letters | Length mult | With Long Haul |
| ------- | ----------- | -------------- |
| 3 | ×0.5 | ×0.5 |
| 4–5 | ×1 | ×1 |
| 6 | ×1.5 | ×2 |
| 7+ | ×2 | ×3 |

Then each Scoring power the word triggers doubles it, and they stack: Action (ends in ING or
ED), Heavy (holds J, Q, X or Z), Twins (two identical letters side by side). The score is
base × word cells × length mult × powers, rounded to the nearest whole number (a half rounds
up). For example CAT with the A on a 3L cell: C4 + A1×3 + T2 = 9, ×0.5 for length = 4.5, pays 5.
CATS with the C on a 2L cell and the S on a 2W cell: C4×2 + A1 + T2 + S2 = 13, ×2 = 26. The
payout carries each word's working: every letter's value and cell, the word cells, the length
multiplier, the powers and the unrounded score.

**Powers.**

| Power | Type | Cost | Effect |
| ----- | ---- | ---- | ------ |
| Hot Cell | Grid | 4 | A permanent 3L cell. Can be bought again |
| Jackpot Cell | Grid | 7 | A permanent 3W cell. Can be bought again |
| Wave Lines | Lines | 6 | Two weaving lines, and their mirror, pay |
| Zigzag Lines | Lines | 6 | The two lines zigzagging between a chosen pair of neighbouring rows pay. Again for another pair |
| Extra Move | Moves | 5 | +2 moves every spin |
| Big Hold | Moves | 5 | Hold up to 3 reels between spins instead of 1 |
| Wild Reel | Tiles | 5 | Blanks on the strips: any letter, scores 0 |
| Action | Scoring | 4 | Words ending ING or ED ×2 |
| Heavy | Scoring | 4 | Words with J, Q, X or Z ×2 |
| Twins | Scoring | 4 | Words with a double letter ×2 |
| Long Haul | Scoring | 4 | Length mult ×2 at 6 letters, ×3 at 7+ |

**Big Hold.** Adds 2 reels to the free hold (Holds, above), so up to 3 reels can be held
between spins, every spin of every round.

**Zigzag Lines.** Buying it asks which pair of neighbouring rows it pays (rows 1–2, 2–3, …);
a pair it already pays is not offered. It stays in the shop's pool while a pair is free, so a
row bought later makes a new pair to buy.

**Wild Reel.** Buying it writes 2 blanks over random positions of every strip (two draws can
land on the same position, leaving one blank), and the grid refreshes to show them. A reel
bought afterwards gets its 2 blanks too. Where the blanks land comes from the run's seed.

**Rounds.** Rounds 1–10 have fixed targets: 45, 65, 95, 130, 170, 220, 290, 400, 550, 760.
From round 11 each target is 25% above the last, rounded (950, 1188, 1484, …). A round starts
with 0 points and 3 spins. After each payout:

- the round score reaches the target: the round is **cleared** and the shop opens;
- otherwise, with spins left, the player spins again;
- otherwise the player is **short**.

**Tokens.** Tokens are the run's currency; a run starts with none, and they carry from round to
round. A clear pays 5 tokens plus 2 for each spin left unused.

**Extra Spin.** When short, the player may buy one Extra Spin for 3 tokens, once a round: it
grants one more spin. Otherwise the run is **over**. A new run starts again from round 1.

**Shop.** A clear opens the shop, which offers:

- **Power cards.** 3 powers drawn at random, without repeats, from the pool of 11 less what the
  run holds at its max: Hot Cell and Jackpot Cell have no max, Zigzag Lines is offered while a row
  pair is free, every other power is held once at most. With premium cells off, Hot Cell and
  Jackpot Cell are not offered. Each card sells once a stock, at the power's cost.
- **Add Reel**, always on sale: a new reel with its own strip joins on the right. It costs 3
  tokens, then 1 more for each reel bought this run (3, 4, 5, …), up to 12 reels.
- **Add Row**, always on sale: every column grows by one tile from its strip, the cells are laid
  again so the new row has its own, and the row is a new pay line. 8 tokens for the fourth row,
  12 for the fifth, up to 5 rows. Config: `maxRows` (5) and `addRowCosts` ([8, 12]).
- **Reroll**: a fresh set of 3 power cards. It costs 1 token, then 1 more for each reroll in this
  shop (1, 2, 3, …); the next shop starts again at 1.

Records count the powers discovered out of the 11 and ignore ids no longer in the pool.

The shop's cards come from the run's seed, so leaving and reopening the game shows the same
cards. Leaving the shop starts the next round; holds are cleared and the Extra Spin is on offer
again.

## Tuning

Measured with `pnpm --filter @wordpoker/game-rules exec tsx scripts/probe-slot-speller.ts [firstSeed] [runs] [all|runs|powers|min]`
(STO-1165, re-run on the current rules in STO-1188). `PROBE_TARGETS=45,65,…`, `PROBE_GROWTH=0.25`
and `PROBE_ROW_COSTS=8,12` try a curve or prices without editing config. The bot is greedy: each
step it tries every nudge and swap the cells allow (swaps sampled to 200 on wide grids), takes
the best grid total with premium cells applied, and pays when nothing improves. Between spins it
holds the best word's reels, as many as it may (1, or 3 with Big Hold), and it buys the Extra
Spin when short. People find much less than this bot (maybe 30–50% of it), so these numbers are
a ceiling, not a target. 200 seeds throughout.

**Starting 5×3 grid**, 3 spins a seed. The playable build's bot gave 35.5, 61.5 with a fourth
row, 44.6 with Wave and 45.8 with one Zigzag pair; this bot agrees within a few points.

| Grid | Mean spin |
| ---- | --------- |
| Shipped (3-letter words ×0.5, premium cells) | 34.3 |
| No premium cells | 24.5 |
| 4+ letters only | 24.6 |
| 3-letter words at ×1 | 41.4 |
| + a fourth row | 56.3 |
| + Wave Lines | 42.0 |
| + one Zigzag pair | 42.9 |

**Each power alone** on a 7×3 grid (baseline 61.4 a spin), a 3-spin round a seed:

| Power | Spin | Δ | Δ per token |
| ----- | ---- | - | ----------- |
| Jackpot Cell | 88.7 | +27.3 | 3.90 |
| Twins | 74.7 | +13.3 | 3.32 |
| Wild Reel | 75.3 | +13.9 | 2.77 |
| Heavy | 72.0 | +10.6 | 2.64 |
| +1 reel (3 tokens) | 68.2 | +6.8 | 2.27 |
| +1 row (8 tokens) | 79.4 | +18.0 | 2.24 |
| Action | 69.8 | +8.3 | 2.08 |
| Extra Move | 70.0 | +8.6 | 1.71 |
| Zigzag Lines (one pair) | 71.0 | +9.5 | 1.59 |
| Wave Lines | 70.2 | +8.7 | 1.46 |
| Hot Cell | 66.4 | +4.9 | 1.24 |
| Long Haul | 66.1 | +4.7 | 1.17 |
| Big Hold | 66.1 | +4.6 | 0.93 |

Jackpot Cell is the standout: a permanent triple-word cell on a row line. Zigzag, which paid
every pair before STO-1186, now buys one pair and drops from first to mid-table. Big Hold stays
weak for a bot that replays greedily.

**Whole runs**, shop policy "power" (buy offered powers in the order of the table above, then
reels with what is left):

| Round | Target | Reached | Clear % | Mean spin | Tokens earned | Reels |
| ----- | ------ | ------- | ------- | --------- | ------------- | ----- |
| 1 | 45 | 200 | 100 | 33 | 7.1 | 5.0 |
| 3 | 95 | 199 | 99 | 61 | 6.8 | 5.6 |
| 5 | 170 | 192 | 95 | 112 | 6.9 | 5.8 |
| 7 | 290 | 175 | 97 | 201 | 6.8 | 6.0 |
| 9 | 550 | 159 | 91 | 324 | 6.3 | 6.1 |
| 10 | 760 | 144 | 76 | 414 | 6.6 | 6.1 |
| 11 | 950 | 109 | 78 | 524 | 6.5 | 6.2 |
| 13 | 1484 | 63 | 67 | 755 | 6.5 | 6.4 |
| 15 | 2319 | 33 | 73 | 1518 | 7.3 | 6.4 |
| 17 | 3624 | 17 | 76 | 2878 | 7.3 | 6.5 |

The bot's runs end in round 11 at the median (10th percentile 6, 90th 16). Jackpot Cell is held
by half the runs by round 3 and nearly all by round 9; Twins, Heavy, Wild Reel and Action follow.
Other policies die sooner: "reel" (reels first) median 9, "row" (Add Row whenever it can) median
7. The power-first bot never has 8 tokens left for Add Row, and buying rows first costs it four
rounds, so Add Row is not underpriced and keeps 8, then 12. The bot holds about 1 token after
each shop and owns most of the pool by round 12: neither buy-everything nor buy-nothing, so token
income is unchanged.

**Why this curve.** Round 1's 45 takes about two average spins (the old 20 fell to one). Through
round 9 the table rises as fast as the bot's build adds points (its mean spin roughly doubles
every three rounds) and the bot clears 91% or more; round 10's 760 is the first steep step, and
past it +25% a round outpaces a finished build within a few rounds. The previous curve (20 … 820,
then +20%) let this bot's 90th-percentile run reach round 21.