# Betting, Pots & Tie-Breakers

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 21. Tie-Breaker Rules

Seats with equal final scores are separated in this order. A tie-breaker only orders the
tied seats; it adds nothing to anyone's score.

## 1. Longest Valid Word

The word containing the most letters wins.

A choice tile contributes one letter: the face that was played (§10).

## 2. (Retired)

Earlier rules compared the highest single letter value in each word here. The product spec
has no such step, so it is no longer part of the ladder. The number is kept so that §21.3
still names the draw.

## 3. High-Value Tile Draw

Each tied seat draws one random tile. The highest printed value wins.

If the highest value is still shared, the seats that shared it each draw **another** tile,
which **adds** to their draw total. The highest total wins.

### Example

- Ana and Ben tie on score and on word length.
- Ana draws A (1). Ben draws A (1). Still tied.
- Ana draws Z: her total is 1 + 10 = **11**. Ben draws T: his total is 1 + 2 = **3**.
- Ana wins the tie.

Drawing continues, one tile per still-tied seat, until one seat leads.

## When No Word Is Valid

A seat whose submission is invalid or missing has no word, and §11 scores it 0. Such seats
stay in the showdown, so several of them can tie on 0:

- Tie-breaker 1 reads a word's length, and a seat with no word has none, so it passes over
  a group of them.
- The high-value tile draw (3) separates them, exactly as it separates any other tie.

Nothing is carried or refunded: the pot goes to the seat the draw picks, and every pot is
settled by the same ladder (§25). A tie is settled once for the seats that share it: every
pot those seats contest is awarded by that one draw.

If only one seat remains because the others folded, §26 awards that seat the pot without a
showdown — there is no tie to break, and no tile is drawn.

## The Draw's Pool

Tie-breaker 3 draws from a freshly shuffled single-letter bag (§6), so every drawn tile has
one printed value.

- Drawn tiles are discarded after the tie-breaker and never return to the pool during it, so
  the only way to run out of tiles is to draw the whole bag, which is refused rather than
  reusing one.

<!-- Contract status: the whole of §21 ships. The ladder is
     `packages/game-rules/src/money/showdown.ts` (`rankShowdown`,
     STO-320/STO-321/STO-322/STO-323), with the draw's pool and tile values behind
     `showdownDrawPool` / `showdownDrawValue`, and the ranking's wire shape is
     `packages/contracts/src/showdown.ts`. The retired highest-letter step, the draw that adds
     a round's tile to the seat's running total, the single-letter pool, and the one draw a
     tied group gets across every pot it contests are STO-468; the no-valid-word case above
     was resolved by STO-326 before the ranking was written. -->

---

# 22. Betting and Table Stack Rules

All bets, including blinds, use only the player's Table Stack.

Wallet Coins cannot:

- Cover a call
- Increase a raise
- Complete an all-in
- Automatically refill a stack
- Be transferred into the table during an active hand

## Minimum Bet and Raise

The table's minimum bet is its **big blind** (§5).

- The first bet of a later betting round must be at least the big blind.
- A raise must add at least the larger of the big blind and the previous raise's increment.
- Pre-flop the big blind is already the Current Bet, so the first raise is to at least two
  big blinds.
- A player going all in may bet or raise less than these minimums (§31).

These floors are for the default **No Limit** structure. Pot Limit and Fixed Limit tables
are [Formats](formats.md) §40.

## Betting Controls

The interface includes:

- Fold
- Check
- Bet
- Call
- Raise
- Raise Slider
- All In

Only actions currently available should be enabled.

## Raise Slider

The Raise Slider:

- Cannot exceed the player's available Table Stack
- Must respect the table's minimum raise
- Must display the total bet amount clearly
- Must account for chips already committed during the current betting round, blinds included

## All In

All In commits the player's exact remaining Table Stack.

### Example

Current Table Stack: 3,420 Coins

Pressing All In commits:

**3,420 Coins**

The All In button should display the amount:

**ALL IN · 3,420**

---

# 23. Current Bet and Calling

The Current Bet is the highest amount committed by any active player during the current betting round.

On the first betting round, the posted big blind is the opening Current Bet, and each blind
counts as that seat's committed chips for the round.

To Call, a player contributes enough chips to match the Current Bet.

### Example

Current Bet: 500 Coins
Player already committed: 200 Coins

Call amount:

500 − 200 = **300 Coins**

### Blind Example

Blinds: 50 / 100. No one has raised.

- The small blind has committed 50 and calls 100 − 50 = **50 Coins**.
- The big blind has committed 100, owes nothing, and may check (§15).

If the player's remaining stack is less than the required call amount, the player may call by going all in.

---

# 24. Winning Chips

The winning player receives the pot.

Winnings are added to the player's Table Stack, not directly to the Wallet.

Stacks are not capped by winnings. The Buy-In Cap (§2) limits only the Wallet Coins a player
brings to the table.

### Example

Buy-In Cap: 50,000 Coins
Current Table Stack before winning: 50,000 Coins
Pot won: 40,000 Coins

New Table Stack:

50,000 + 40,000 = **90,000 Coins**

---

# 25. Side Pots

Side pots are required when one or more players go all in with different stack sizes.

A player who goes all in can win only the portions of the pot they put chips into:

- Everything bet up to the all-in amount forms the **Main Pot**, which every seat still in the
  hand may win.
- Chips bet beyond that amount form a **Side Pot**, which only the seats that put chips into
  it may win.
- Every seat still plays out the hand and builds a word. Each pot is then awarded separately,
  to the best word among the seats that may win it.

## Example

Three players: Alex, Bree, and Cam.

- Alex has only 30 Coins left and goes all in for 30.
- Bree and Cam keep betting and each commit 100 in total.

Main Pot:

30 × 3 = **90 Coins** — Alex, Bree, and Cam may win it.

Side Pot:

70 more from Bree + 70 more from Cam = **140 Coins** — only Bree and Cam may win it.

Words at showdown: Alex 24 points, Bree 15, Cam 14.

- Alex has the best word of all three and wins the Main Pot (90).
- Only Bree and Cam contest the Side Pot. Bree's 15 beats Cam's 14, so Bree wins it (140),
  even though Alex's word was higher — Alex never put chips into that pot.

Each pot is evaluated independently using the same word scoring and tie-breaker rules.

---

# 26. Winning Without a Showdown

If every player except one folds, the remaining player wins the pot immediately.

The winning player:

- Does not need to reveal private tiles
- Does not need to submit a word
- Receives the entire eligible pot
- Begins the next hand with the awarded chips in their Table Stack

<!-- Contract status: §22–§26 are implemented in the shared engine, blinds included. Every hand
     opens with both blinds posted before the deal (§5, §14; `startHand` in
     `packages/game-rules/src/table/offline.ts`, STO-466), the posted big blind is the first round's
     opening Current Bet and the table's minimum bet, and the raise floor is
     `currentBet + max(lastRaiseSize, bigBlind)`. The wire vocabulary —
     the action union, the refusal reasons, and the pot/seat shapes — is
     `packages/contracts/src/betting.ts` (STO-336), with the table's blinds on
     `packages/contracts/src/rooms.ts` (`blindsFor`, ADR 0004). The stack model is
     `packages/game-rules/src/money/chips.ts` (`commitChips`/`awardChips`, STO-337), and the
     betting-round machine — legality, the current bet, the minimum bet, the raise
     floor, and the reopen rule for full vs short all-in raises — is
     `packages/game-rules/src/money/betting.ts` (`applyBettingAction`/`bettingBounds`/`nextActor`,
     STO-338/STO-339). §25's layering and settlement are
     `packages/game-rules/src/money/pots.ts` (`buildPots`/`resolvePayout`, STO-340/STO-341), with
     each pot ranked independently and an unbreakable §21.3 tie split evenly — odd chips
     clockwise from the dealer — rather than refused. §26's fold-out skips the window and the
     reveal entirely (`judged: []`, STO-342). The offline round machine wires all of it in
     (`packages/game-rules/src/table/offline.ts`, STO-343) with the bot policy in `src/bot/bot.ts`
     (STO-344), and the offline felt renders it (`apps/mobile/src/features/offline/use-offline-game.ts`,
     STO-345). The offline table's stack is ADR 0002 and its blinds are ADR 0004. -->
