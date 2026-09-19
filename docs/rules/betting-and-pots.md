# Betting, Pots & Tie-Breakers

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 21. Tie-Breaker Rules

Ties are resolved in the following order:

## 1. Longest Valid Word

The word containing the most letters wins.

For this tie-breaker, both letters on a two-letter tile count individually.

## 2. Highest Single Letter Value

Compare the highest-value letter used in each tied word.

Example:

- A word containing Q has a highest letter value of 10.
- A word containing J has a highest letter value of 8.

The Q word wins.

Tile multipliers do not change the printed letter value for this tie-breaker.

## 3. High-Value Tile Draw

Each tied player receives one random temporary tile.

The player with the highest printed tile value wins.

For two-letter draw tiles, use the combined printed value unless the game configuration disables two-letter tiles in tie-breaker draws.

Drawn tiles are discarded after the tie-breaker.

If the draw is still tied, repeat until there is a winner.

---

# 22. Betting and Table Stack Rules

All bets use only the player's Table Stack.

Wallet Coins cannot:

- Cover a call
- Increase a raise
- Complete an all-in
- Automatically refill a stack
- Be transferred into the table during an active hand

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
- Must account for chips already committed during the current betting round

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

To Call, a player contributes enough chips to match the Current Bet.

### Example

Current Bet: 500 Coins
Player already committed: 200 Coins

Call amount:

500 − 200 = **300 Coins**

If the player's remaining stack is less than the required call amount, the player may call by going all in.

---

# 24. Winning Chips

The winning player receives the pot.

Winnings are added to the player's Table Stack, not directly to the Wallet.

Stacks are not capped after joining.

### Example

Original buy-in: 50,000 Coins
Current Table Stack before winning: 50,000 Coins
Pot won: 40,000 Coins

New Table Stack:

50,000 + 40,000 = **90,000 Coins**

The fixed buy-in limits only the amount initially brought to the table.

---

# 25. Side Pots

Side pots are required when one or more players go all in with different stack sizes.

A player may win only the portions of the pot they were eligible to contest.

## Example

- Player A commits 500 Coins.
- Player B commits 1,000 Coins.
- Player C commits 1,000 Coins.

Main Pot:

500 × 3 = 1,500 Coins

Player A, Player B, and Player C may win the Main Pot.

Side Pot:

500 additional Coins from Player B
500 additional Coins from Player C

Side Pot total: 1,000 Coins

Only Player B and Player C may win the Side Pot.

Each pot is evaluated independently using the same word scoring and tie-breaker rules.

---

# 26. Winning Without a Showdown

If every player except one folds, the remaining player wins the pot immediately.

The winning player:

- Does not need to reveal private tiles
- Does not need to submit a word
- Receives the entire eligible pot
- Begins the next hand with the awarded chips in their Table Stack
