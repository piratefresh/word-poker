# Balances, Buy-Ins & Joining

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 1. Player Balance System

Word Poker uses two separate balances:

## Wallet Balance

The player's permanent account balance.

Wallet Coins are used to:

- Join tables
- Re-buy after losing a full Table Stack
- Receive remaining chips when leaving a table

Wallet Coins cannot be used directly for bets during a game.

## Table Stack

The chips currently available to the player at a specific table.

All bets, calls, raises, and all-ins must come from the player's Table Stack.

The Table Stack is created when the player pays the table's fixed buy-in.

### Example

Wallet before joining: 185,000 Coins
Table buy-in: 50,000 Coins

After joining:

- Wallet Balance: 135,000 Coins
- Table Stack: 50,000 Coins

Wallet Balance and Table Stack must always be stored separately.

---

# 2. Table Buy-Ins

Each table has one fixed buy-in amount.

Every player joining the same table begins with the same Table Stack.

There are:

- No custom buy-ins
- No minimum-to-maximum buy-in ranges
- No buy-in slider
- No forced blinds

## Example Tables

### Beginner Table

Buy-In: 500 Coins
Maximum Players: 6

### Intermediate Table

Buy-In: 5,000 Coins
Maximum Players: 6

### High Stakes Table

Buy-In: 50,000 Coins
Maximum Players: 6

The fixed buy-in ensures that players with larger Wallet Balances cannot enter a low-stakes table with more betting power than everyone else.

Stacks may grow beyond the original buy-in after the game begins.

---

# 3. Table Browser

Each table card displays:

- Table Name
- Fixed Buy-In
- Current Player Count
- Maximum Player Count
- Join button

## Example

**High Stakes**

Buy-In: 50,000 Coins
Players: 4/6

[ JOIN ]

## Join Button Rules

The Join button is disabled when:

- The table is full
- The player's Wallet Balance is below the fixed buy-in
- The player is already seated at the table
- The table is temporarily unavailable

---

# 4. Joining a Table

Pressing Join opens a confirmation modal.

The modal displays:

- Table Name
- Wallet Balance
- Fixed Buy-In
- Wallet Balance after joining
- Confirm and Join button
- Cancel button

## Example

**Join High Stakes?**

Wallet Balance: 185,000 Coins
Buy-In: 50,000 Coins
Remaining Wallet Balance: 135,000 Coins

[ CONFIRM & JOIN ]
[ CANCEL ]

## Joining Rules

- The player must have a Wallet Balance equal to or greater than the buy-in.
- The exact fixed buy-in is deducted from the Wallet.
- The same amount becomes the player's Table Stack.
- Partial buy-ins are not allowed.
- Custom buy-ins are not allowed.
- The player cannot use additional Wallet Coins after joining.
- A seat becomes occupied only after the transaction succeeds.

The Wallet deduction and Table Stack creation must happen as one transaction. The system must not deduct Coins unless the player successfully joins the table.

---

# 5. Players and Table Setup

Each table supports:

- Minimum recommended players: 4
- Maximum players: 6
- One house-controlled dealer
- Equal fixed buy-ins
- No small blind
- No big blind
- No ante
- No forced opening bet

The house dealer manages:

- Tile distribution
- Community tile reveals
- Player turn order
- Pots
- Showdowns
- Tie-breaker draws
- Round transitions

The dealer does not participate as a player.

## Dealer Button and Turn Order

A dealer-position marker rotates clockwise after each completed hand.

The first active player clockwise from the dealer position acts first during the first betting round.

The first remaining active player clockwise from the dealer position acts first during later betting rounds.

The dealer marker determines action order only. It does not require any forced bet.
