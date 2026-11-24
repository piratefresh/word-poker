# Slot Speller

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 47. Slot Speller

Slot Speller is a solo, endless slot-machine word mode. There is no table, no betting and no
bots: the player spins a grid of letter reels, rearranges it with a few moves, and every word
the pay lines spell scores. Every number below is config
(`packages/game-rules/src/slot-speller/config.ts`), to tune after playtesting. Reel Lock, Split
Tiles and Wild Reel's effects are specified separately as they land.

**Strips.** Each reel is a strip of 30 tiles. Every strip tile is drawn on its own, with
replacement, from the normal bag's letter distribution (§7), so a strip can repeat letters the
bag holds once. Each tile then takes one multiplier roll: under 3% it is a Triple Letter tile;
otherwise under 15% (20% for a letter worth 5 or more) it is a Double Letter tile (§9's rates).
Strips hold no choice tiles. A run's strips come from its seed: the same seed gives the same
strips and, given the same actions, the same spins.

**Grid.** A run starts with 5 reels and 3 rows. Each reel shows 3 consecutive tiles of its
strip, wrapping from the end back to the start. Extra Row adds a row (at most 2).

**Spins.** A spin is allowed at the start of a round or between spins, while spins are left. A
spin sends every reel to a new random place on its strip and refills its column. A
reel held by Reel Lock keeps its column, and the lock is spent. A round has 3 spins; each spin
grants 4 moves (6 with Extra Move).

**Moves.** Each move costs one:

- **Nudge** a reel up or down one tile. Up drops the top tile and brings the next strip tile in
  at the bottom; down drops the bottom tile and brings the previous strip tile in at the top.
  Tiles swapped into the column ride along.
- **Swap** any two grid cells. A swap changes the grid only, never the strips.

A move is refused, with nothing changed, when no moves are left, outside a spin's move phase,
on a cell or reel off the grid, or when a swap names the same cell twice.

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

**Word score.** Base is the sum of each tile's face value, doubled on a Double Letter tile and
tripled on a Triple Letter tile (blanks 0). The length multiplier is:

| Letters | Length mult | With Long Haul |
| ------- | ----------- | -------------- |
| 3 | ×0.5 | ×0.5 |
| 4–5 | ×1 | ×1 |
| 6 | ×1.5 | ×2 |
| 7+ | ×2 | ×3 |

Then each Scoring power the word triggers doubles it, and they stack: Action (ends in ING or
ED), Heavy (holds J, Q, X or Z), Twins (two identical letters side by side). The score is
base × length mult × powers, rounded to the nearest whole number.

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

**Rounds.** Round 1's target is 20; each round's target is 25% above the last, rounded
(20, 25, 31, …). A round starts with 0 points and 3 spins. After each payout:

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
