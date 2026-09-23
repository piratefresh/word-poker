# Word Poker — Complete Game Specification (product spec)

The product owner's specification, as received on 2026-09-23. The wording is kept as
received; only the layout was converted to Markdown. It is the source the rules under
[`docs/rules/`](rules/) are derived from. Where it is ambiguous or contradicts itself, the
rules record the reading that was chosen and the ADR that chose it — see
[FINAL_RULES.md](FINAL_RULES.md#reading-the-product-spec).

---

## 1. Letter Values & Scoring

### Letter Point Values

| Points | Letters          |
| -----: | ---------------- |
|      1 | A, E, I, O, U    |
|      2 | R, S, T, L, N    |
|      3 | D, G             |
|      4 | B, C, M, P       |
|      5 | F, H, V, W, Y, K |
|      8 | J, X             |
|     10 | Q, Z             |

### How to Calculate Score

**Step 1: Base Score**
Add up all letter values in the word.
Example: MARKET = M(4) + A(1) + R(2) + K(5) + E(1) + T(2) = 15 points

**Step 2: Double choice words**
15% chance any tile is "doubled".
Favors high-value letters (5+ points).

**Step 3: Full Rack Bonus**
Use all 7 tiles = +10 points.
Example: MONSTER (7 letters) = base score + 10

**Step 4: have all letters be doubled letters appears**
If there is a double letter or triple letter that appears, that would double or triple points.
If you used MONSTER (7 LETTERS) which is equal to and 10 points are added from all 7 TILES
USED + M is doubled which means there is an extra 4 points. That would mean they would get
21 points.
You could also get something like Muse with only s doubled. That would be 8 but with a
double E. That would get +1 for E = 1x2 = 2 for 9 points.

#### MONSTER — Score Breakdown

Word: MONSTER (7 letters)

Letter Values: M = 4, O = 1, N = 2, S = 2, T = 2, E = 1, R = 2

- Step 1: Base Score (no bonuses): M(4) + O(1) + N(2) + S(2) + T(2) + E(1) + R(2) = 14 points
- Step 2: Apply Double Letter Bonus (M is doubled): M = 4 × 2 = 8 points (instead of 4).
  M(8) + O(1) + N(2) + S(2) + T(2) + E(1) + R(2) = 18 points
- Step 3: Apply Full Rack Bonus (all 7 tiles used): 18 points + 10 bonus = 28 points

### Word Validation

- ✓ Must be 2-7 letters
- ✓ Must be in Scrabble dictionary (TWL or SOWPODS)
- ✗ Invalid word = 0 points
- ✗ Timeout = 0 points

### Tie-Breaker Rules (In Order)

1. Longest word wins
2. Still tied? High point tile draw
   - Each player draws 1 random tile
   - Highest value wins
   - Discard tiles draw
   - Repeat if still tied
3. Still tied? They get a second letter which will determine if there is a winner there.
   For example if I get an A which is 1 point, I may get a Z as well. That would be 11 points.

No extra bonus or anything if you do the tiebreaker.

---

## 2. Double Choice Letter Tiles

### What Are Double Choice Letter Tiles?

One physical tile printed with 2 letters on a single tile (e.g., "TH", "ER", "IN", "ED").
Both letters are visible to the player. Counts as 1 tile.

### Rules for Double Choice Letter Tiles — How They Work

When building your word, you choose ONE of the two letters to actually use — not both.
Whichever letter you pick is the one that counts: for its point value, for word length, and
for the full-rack bonus. The letter you don't pick is not used, not scored, and doesn't count
toward anything. Players will naturally pick whichever of the two scores higher, unless the
word they're building only works with the lower one.

### Frequency

- 2-3 two-letter tiles maximum per round
- Can appear in either: private tiles (your 2 pocket tiles), community tiles (the 5 shared
  tiles), or mix of both
- Preferable one in Private and one in community. It is up to you.
- Should not be 3 letter or 4 letter tiles.

### Example Common Letter Pairs on Choice Tiles

- Vowel pairs: A/E, E/I, O/U, A/I
- Consonant pairs: T/S, R/N, D/T, S/L
- Q/K (10/5 points), Z/X (10/8 points), J/H (8/5 points)

Consider a distinct color or subtle animation to make these tiles feel special.

---

## 3. Game Structure

### Setup

- 4-6 players at table
- Everyone starts with same chips (example: 1,000 chips)
- Should be house dealer

### How a Round Works

**PHASE 1: BLINDS & DEAL**
- Small blind and big blind post forced bets
- Each player gets 2 private tiles (only you can see these)
- May include 0-2 two-letter tiles

**PHASE 2: PRE-FLOP**
- Players bet based on their 2 private tiles only
- Don't know what community tiles will be yet
- Betting actions: Fold, Call, or Raise

**PHASE 3: THE FLOP**
- 3 community tiles revealed (everyone can see and use these)
- May include 0-2 two-letter tiles
- Betting round: Check, Bet, Call, Raise, or Fold

**PHASE 4: THE TURN**
- 1 more community tile revealed (4 community tiles total now)
- May include a two-letter tile
- Betting round: Check, Bet, Call, Raise, or Fold

**PHASE 5: THE RIVER**
- Final community tile revealed (5 community tiles total now)
- May include a two-letter tile
- Maximum 2-3 two-letter tiles total across all 7 tiles (2 private + 5 community)
- Last betting round: Check, Bet, Call, Raise, or Fold
- Reminder only 2 tiles-3 tiles maximum

**PHASE 6: reveal**
- 60 seconds - Build your best word
- Use ANY combination: just your 2 private tiles; just community tiles (2-5 tiles); mix of
  private and community tiles
- Total word: 2-7 letters
- Two-letter tiles must be used together (cannot split)

**PHASE 7: SHOWDOWN**
- Highest scoring word wins all the chips in the pot
- Tie-breakers applied if needed
- New round starts

### Special situation (Side pots) — Important

Sometimes a player runs out of chips to bet with, but the other players still want to keep
betting more. Here's what happens:

- If a player only has a small amount of chips left, they can bet all of it — this is called
  going "all-in." They can't bet any more than that.
- Because they can't match any further bets, a line gets drawn. All the money bet up to that
  player's all-in amount goes into one pile, called the main pot.
- If the other players keep betting more money after that, all of that extra money goes into
  a second, separate pile called the side pot.
- The player who went all-in can only win the main pot — they have no chance of winning the
  side pot, because they never put any money into it.
- The other players (who kept betting) can win either pot.
- Everyone still plays out the rest of the hand and builds their best word like normal. At
  the end, each pile of money is handed out separately — the best word among the people who
  could win that particular pile gets it.

**A simple example.** Three people are playing: Alex, Bree, and Cam.

- Alex only has $30 left, so that's all he can bet. He's now "all-in."
- Bree and Cam both have more money and keep betting, they each end up putting in $100 total.

Now there are two separate piles of money:

- Main pot = $90 (that's $30 from each of the three players). All three players — Alex,
  Bree, and Cam — can win this pile.
- Side pot = $140 (that's the extra $70 each that Bree and Cam bet beyond Alex's $30). Only
  Bree and Cam can win this pile — Alex is left out, since he didn't put any money into it.

At the end, everyone shows their word: Alex's word is worth 24 points, Bree's 15, Cam's 14.

- Alex has the highest score of everyone (24), so Alex wins the main pot ($90).
- For the side pot, only Bree and Cam are being compared, since Alex isn't allowed to win
  it. Bree's 15 beats Cam's 14, so Bree wins the side pot ($140) — even though Alex's score
  was higher than both of theirs. It doesn't matter here, because Alex was never competing
  for that pile of money in the first place.

### Betting Actions

- Fold - Exit round, lose bets
- Check - Pass (if no bet yet)
- Call - Match current bet
- Raise - Increase bet
- All-In - Bet all chips

### Disconnect Handling

During any betting phase: if a player's timer expires (idle or disconnected), auto-fold —
consistent with the existing reveal-phase timeout rule ("timeout = 0 points"). Chips already
committed to the pot stay in the pot.

---

## 4. UI Features

### Shuffle Button

- Unlimited uses per round
- Rearranges tile display order only
- Helps visualize different word combinations
- Does not change which tiles you have

### Anonymity (BetRivers Style)

- Hidden usernames/avatars during play
- Prevents player targeting
- Similar to anonymous poker tables

### Floating Chips / Pot Animation

- When a player bets, their chips visually float toward the pot/winning player
- Keeps pot dynamics visible and readable in real time as the hand progresses
- Replaces the old disconnect-only trigger — now fires on every bet, not just when someone leaves

### Winner Highlight Effect

- When a player wins the hand, their avatar gets a celebratory highlight (glow/spotlight)
- Effect plays in place — doesn't take over or leave the main game screen
- Keeps the table visible and the next hand able to start right after, without a
  full-screen interruption

### Idle / Auto-Kick Handling

Players are automatically kicked if:

- Table becomes empty
- Player remains idle for a preset period

Ensures smooth gameplay for remaining players.

### Pre-Selection of Actions

- Players can pre-select their betting/word-building decisions (Fold, Check, Call, Raise)
  before their turn
- Pre-selected actions execute automatically when it's the player's turn
- Prevents stalling and supports fast-paced rounds

---

## 5. Accessibility (ADA)

**Text-to-Speech**
- Reads letter tiles aloud
- Announces submitted words
- Full screen reader support

**Visual Settings**
- Bigger tile size option
- High contrast mode
- Adjustable font sizes

**Audio/Motion Settings**
- Disable animations (reduce motion)
- Disable sound effects
- Silent mode (visual only)

---

## 6. Game Variations

### Multiple Room Types

The platform will feature different room types with variations in:

- Timing: 30s vs 60s rounds
- Betting structures: No Limit, Pot Limit, Fixed Limit
- Two-letter tile frequency: 0-1 vs 2-3 per round
- Rule variations: Different bonus structures

The platform will A/B test formats to optimize player engagement and determine the most
popular gameplay style.

---

## Tournaments & Cash Games

**Tournament Buy-Ins**: Freeroll ($0) • Micro ($1-$5) • Low ($10-$50) • Mid ($100-$500) •
High Roller ($1K+)

**Tournament Types**
- SNG: 4-6 players, 15-30 min
- MTT: 50-500 players, 1-3 hrs

**Cash Game Stakes**: Micro ($0.25/$0.50) • Low ($1/$2) • Mid ($5/$10) • High ($25/$50+)

### Buy-In as Bet Cap

The listed buy-in amount is the maximum a player can bet at that table or in that
tournament — it sets the ceiling on total chips/coins in play for that player, not just the
entry cost.

Example: at a Low tier ($10–$50) table, a player cannot commit more than $50 total, even
across rebuys or top-ups, without moving up to the next stake tier.

---

## Leaving / Disconnecting

- **Disconnect During a Hand**: A player who disconnects during a hand will have a defined
  period to reconnect.
- **Failure to Reconnect**: If the player does not reconnect within the allowed time, they
  are automatically removed from the hand/table.
- **Chips in the Pot**: Any chips the player has already committed to the pot remain in the pot.
- **During Betting**: If the disconnected player cannot act within the allowed time, their
  hand is folded.
- **During Word Building**: If the player disconnects and does not submit a word, they
  receive 0 points.
- **Remaining Players**: The hand continues for the remaining active players.
- **Leaving Between Hands**: A player may leave between hands and keeps their remaining chips.
- **One Player Remaining**: If only one player remains at the table, a 60-second countdown
  begins. If another player does not join before the countdown ends, the table/session closes.
- **Remaining Player's Chips**: When the table closes, the remaining player keeps their chips.
