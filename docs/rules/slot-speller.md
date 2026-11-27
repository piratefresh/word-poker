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
strip, wrapping from the end back to the start. Extra Row adds a row (at most 2).

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

A tile on a **word cell** cannot be swapped in or out: only nudging that reel changes the
letter on it.

Config (`cells`): no cells at all, cells fixed where the pattern draws them instead of moving,
which cells refuse swaps (word cells, all cells, none), the diagonal spacing and each
multiplier.

**Spins.** A spin is allowed at the start of a round or between spins, while spins are left. A
spin sends every reel to a new random place on its strip and refills its column. A
reel held by Reel Lock keeps its column, and the lock is spent. A round has 3 spins; each spin
grants 4 moves (6 with Extra Move).

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
down and up through the rows (row 1, 2, 3, 2, 1, … on three rows) and its mirror. Zigzag Lines
adds, for each pair of neighbouring rows, the two lines that alternate between them. A cell can
pay on more than one line.

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
| Extra Row | Grid | 8 | +1 row and paying line. Max 2 |
| Wave Lines | Lines | 6 | Two weaving lines, and their mirror, pay |
| Zigzag Lines | Lines | 6 | Lines alternating between neighbouring rows pay |
| Extra Move | Moves | 5 | +2 moves every spin |
| Reel Lock | Moves | 5 | Once a round, hold up to two reels for the next spin |
| Split Tiles | Tiles | 5 | Each spin, 2 tiles gain a second face and play as the better word |
| Wild Reel | Tiles | 5 | Blanks on the strips: any letter, scores 0 |
| Action | Scoring | 4 | Words ending ING or ED ×2 |
| Heavy | Scoring | 4 | Words with J, Q, X or Z ×2 |
| Twins | Scoring | 4 | Words with a double letter ×2 |
| Long Haul | Scoring | 4 | Length mult ×2 at 6 letters, ×3 at 7+ |

**Reel Lock.** Once a round, between spins, the player may hold up to 2 reels; tapping a held
reel releases it. The next spin leaves held reels' columns and premium cells as they are,
swapped tiles included, and spends the lock for the round, even if the player held only one reel. A spin with no reel
held does not spend it. Holding is refused outside the between-spins phase, without the power,
after this round's lock is spent, or for a third reel. The next round brings the lock back.

**Split Tiles.** After every spin lands, 2 random tiles in the grid gain a second face and
become choice tiles, playing either face (Paying a line, above). Only plain tiles qualify: not
a blank, not already a choice tile, and not on a reel Reel Lock held. The second face is the
letter's partner in the first choice pair holding it (§10: A/E, E/I, O/U, A/I, T/S, R/N, D/T,
S/L, Q/K, Z/X, J/H, so A gains E and T gains S); a letter in no pair gains a random one of A,
E, I, O, R, S, T, N. The tile keeps its multiplier. Only the grid changes, never the strips, so
a nudge or the next spin brings plain tiles back. Which tiles split comes from the run's seed.

**Wild Reel.** Buying it writes 2 blanks over random positions of every strip (two draws can
land on the same position, leaving one blank), and the grid refreshes to show them. A reel
bought afterwards gets its 2 blanks too. Where the blanks land comes from the run's seed.

**Rounds.** Rounds 1–10 have fixed targets: 20, 40, 70, 110, 160, 230, 320, 450, 620, 820.
From round 11 each target is 20% above the last, rounded (984, 1181, 1417, …). A round starts
with 0 points and 3 spins. After each payout:

- the round score reaches the target: the round is **cleared** and the shop opens;
- otherwise, with spins left, the player spins again;
- otherwise the player is **short**.

**Tokens.** Tokens are the run's currency; a run starts with none, and they carry from round to
round. A clear pays 5 tokens plus 2 for each spin left unused.

**Extra Spin.** When short, the player may buy one Extra Spin for 3 tokens, once a round: it
grants one more spin. Otherwise the run is **over**. A new run starts again from round 1.

**Shop.** A clear opens the shop, which offers:

- **Power cards.** 3 powers drawn at random, without repeats, from the powers the run does not
  already hold at their max (Extra Row is offered until held twice). Each card sells once, at the
  power's cost.
- **Add Reel**, always on sale: a new reel with its own strip joins on the right. It costs 3
  tokens, then 1 more for each reel bought this run (3, 4, 5, …), up to 12 reels.
- **Reroll**: a fresh set of 3 power cards. It costs 1 token, then 1 more for each reroll in this
  shop (1, 2, 3, …); the next shop starts again at 1.

The shop's cards come from the run's seed, so leaving and reopening the game shows the same
cards. Leaving the shop starts the next round; locks are cleared and the Extra Spin is on offer
again.

## Tuning

Measured with `pnpm --filter @wordpoker/game-rules exec tsx scripts/probe-slot-speller.ts [firstSeed] [runs] [all|runs|powers|min]`
(STO-1165). The bot is greedy: each step it tries every nudge and swap (swaps sampled to 200 on
wide grids), takes the best grid total, and pays when nothing improves. **These numbers were
measured before premium cells (STO-1180), with DL/TL tiles on the strips; STO-1188 re-runs
them.** It locks the best
word's reels when it holds Reel Lock and buys the Extra Spin when short. People find much less
than this bot (maybe 30–50% of it), so these numbers are a ceiling, not a target.

**Starting 5×3 grid**, 200 seeds × 3 spins:

| Word rule | Mean spin |
| --------- | --------- |
| 3-letter words at ×0.5 (shipped) | 30.6 |
| 4+ letters only | 23.7 |
| 3-letter words at ×1 | 35.6 |

This confirms the prototype's "about 31 a spin (24 with 4+ only)".

**Each power alone** on a 7×3 grid (baseline 44.2 a spin), 200 seeds × a 3-spin round:

| Power | Spin | Δ | Δ per token |
| ----- | ---- | - | ----------- |
| Zigzag Lines | 73.4 | +29.2 | 4.9 |
| Wave Lines | 60.0 | +15.8 | 2.6 |
| Twins | 55.7 | +11.6 | 2.9 |
| Extra Row | 55.3 | +11.2 | 1.4 |
| Extra Row ×2 | 62.8 | +18.6 | 1.2 |
| Heavy | 54.2 | +10.1 | 2.5 |
| Action | 50.8 | +6.6 | 1.7 |
| +1 reel (3 tokens) | 50.6 | +6.5 | 2.2 |
| Extra Move | 50.1 | +5.9 | 1.2 |
| Wild Reel | 50.0 | +5.9 | 1.2 |
| Long Haul | 47.3 | +3.1 | 0.8 |
| Split Tiles | 46.9 | +2.7 | 0.5 |
| Reel Lock | 45.1 | +1.0 | 0.2 |

Long Haul grows with grid width (more 6–7 letter words); Reel Lock is weak for a bot that
replays greedily but may matter more to people. Zigzag is the standout; it stays as is.

**Whole runs**, 200 seeds, shop policy "power" (buy offered powers in the order of the table
above, then reels with what is left):

| Round | Target | Reached | Clear % | Mean spin | Tokens earned | Reels | Rows |
| ----- | ------ | ------- | ------- | --------- | ------------- | ----- | ---- |
| 1 | 20 | 200 | 100 | 30 | 8.8 | 5.0 | 3.0 |
| 3 | 70 | 200 | 100 | 64 | 7.7 | 5.8 | 3.3 |
| 5 | 160 | 200 | 100 | 118 | 7.2 | 6.0 | 3.6 |
| 7 | 320 | 196 | 96 | 199 | 6.7 | 6.2 | 4.1 |
| 9 | 620 | 183 | 91 | 297 | 5.9 | 6.3 | 4.8 |
| 10 | 820 | 167 | 85 | 361 | 5.8 | 6.5 | 4.9 |
| 11 | 984 | 142 | 79 | 422 | 5.9 | 7.2 | 4.9 |
| 13 | 1417 | 92 | 75 | 530 | 5.5 | 9.0 | 5.0 |
| 15 | 2040 | 45 | 56 | 596 | 5.0 | 10.5 | 5.0 |
| 17 | 2938 | 9 | 22 | 688 | 5.0 | 11.4 | 5.0 |

The bot's runs end in round 12 at the median (10th percentile 9, 90th 16). Other policies die
sooner: "reel" (reels first) median 7, "row" (save for Extra Row) median 8 — Add Reel buys
fewer points per token than the line and Scoring powers. The bot holds 1–2 tokens after each
shop and owns every power by about round 10, so the shop is neither buy-everything early nor
buy-nothing; prices and token income are unchanged.

**Why this curve.** The table rises about as fast as the bot's build adds points (its mean
spin roughly doubles every three rounds through round 10), asking for a growing share of the
bot's three spins: ~0.2× in round 1, ~0.75× by round 10. Past round 10 a full build plateaus
near 600 a spin, so +20% a round turns a finished build into a few more rounds rather than a
wall.
