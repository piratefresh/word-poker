# Balances, Buy-Ins & Joining

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 1. Player Balance System

Word Poker uses two separate balances:

## Wallet Balance

The player's permanent account balance.

Wallet Coins are used to:

- Join tables
- Re-buy or top up, within the table's Buy-In Cap (§2, §27)
- Receive remaining chips when leaving a table

Wallet Coins cannot be used directly for bets during a game.

## Table Stack

The chips currently available to the player at a specific table.

All bets, calls, raises, blinds, and all-ins must come from the player's Table Stack.

The Table Stack is created when the player pays their buy-in.

### Example

Wallet before joining: 185,000 Coins
Buy-in chosen: 50,000 Coins

After joining:

- Wallet Balance: 135,000 Coins
- Table Stack: 50,000 Coins

Wallet Balance and Table Stack must always be stored separately.

---

# 2. Table Buy-Ins

Every table belongs to a **stake tier**. A tier sets:

- A **buy-in range**: the smallest and largest amount a player may bring when joining
- The **Buy-In Cap**: the top of that range
- The table's **blinds** (§5), derived from the Buy-In Cap

## The Buy-In Cap

The Buy-In Cap is the most Wallet Coins a player may move onto one table in a table session:
the first buy-in, every re-buy, and every top-up (§27) count toward it together.

- A player cannot bring more than the cap, even across re-buys or top-ups.
- To play with more, the player moves up to a higher stake tier.
- Leaving and rejoining the same table does not reset the cap. It resets when the table
  session ends (§29, Table Closing).
- The cap limits Coins brought in, not chips won. A Table Stack may grow beyond the cap from
  pots won (§24).

The cap keeps a player with a large Wallet from buying more betting power than the tier
allows.

## Stake Tiers

The default tiers. Every number is a table setting, so balance testing changes the
configuration and not the code.

| Tier | Buy-in range | Buy-In Cap | Blinds (SB / BB) |
| ---- | -----------: | ---------: | ---------------: |
| Beginner | 200 – 500 | 500 | 5 / 10 |
| Intermediate | 2,000 – 5,000 | 5,000 | 50 / 100 |
| High Stakes | 20,000 – 50,000 | 50,000 | 500 / 1,000 |

The range's floor is 20 big blinds, so no one sits down too short to play a hand. The
tournament and cash-game tiers of the product spec are [Formats](formats.md) §41–§42.

Maximum players at every tier: 4.

---

# 3. Table Browser

Each table card displays:

- Table Name
- Stake tier
- Buy-in range
- Blinds
- Current Player Count
- Maximum Player Count
- Join button

## Example

**High Stakes**

Buy-In: 20,000 – 50,000 Coins
Blinds: 500 / 1,000
Players: 4/4

[ JOIN ]

## Join Button Rules

The Join button is disabled when:

- The table is full
- The player's Wallet Balance is below the bottom of the buy-in range
- The player's remaining Buy-In Cap for that table is below the bottom of the range
- The player is already seated at the table
- The table is temporarily unavailable

---

# 4. Joining a Table

Pressing Join opens a confirmation modal.

The modal displays:

- Table Name
- Wallet Balance
- A buy-in amount control (slider with an exact-value field) over the buy-in range
- Wallet Balance after joining
- Confirm and Join button
- Cancel button

The amount control starts at the most the player may bring: the lowest of the Buy-In Cap
still available to them and their Wallet Balance.

## Example

**Join High Stakes?**

Wallet Balance: 185,000 Coins
Buy-In: [ 50,000 ] (20,000 – 50,000)
Remaining Wallet Balance: 135,000 Coins

[ CONFIRM & JOIN ]
[ CANCEL ]

## Joining Rules

- The chosen buy-in must lie inside the table's buy-in range.
- The chosen buy-in cannot exceed the player's Wallet Balance or their remaining Buy-In Cap.
- The exact chosen amount is deducted from the Wallet.
- The same amount becomes the player's Table Stack.
- The player cannot move more Wallet Coins onto the table except by §27's re-buy and top-up.
- A seat becomes occupied only after the transaction succeeds.

The Wallet deduction and Table Stack creation must happen as one transaction. The system must not deduct Coins unless the player successfully joins the table.

---

# 5. Players and Table Setup

Each table supports:

- Minimum recommended players: 4
- Maximum players: 4
- One house-controlled dealer
- Buy-ins inside the tier's range, up to the Buy-In Cap
- A small blind and a big blind (below)
- No ante

The house dealer manages:

- Tile distribution
- Community tile reveals
- Blinds
- Player turn order
- Pots
- Showdowns
- Tie-breaker draws
- Round transitions

The dealer does not participate as a player.

## Starting the Game (Ready Check)

A seated player sees the table itself straight away, not a holding screen: the seats that
have sat down, around an empty felt. Where the betting controls will be, the player has one
control: **I'M READY** (tapping again takes it back, **NOT READY**).

- Each seat's nameplate shows **READY** once that player has said so.
- Each hand is dealt when **every** seated player is ready and at least **2** are seated.
  The table does not wait to fill its seat cap.
- One seat that is not ready holds the deal. So does a seat that has disconnected.
- If the table goes back to waiting (a player leaves between hands, or the session ends),
  every player says ready again before the next deal.

Online results stay open until that player clicks **PLAY ANOTHER** or leaves the table.
The button shows how many seated players chose to continue (for example, **PLAY ANOTHER 1/4**).
Clicking it takes that player to **I'M READY**, while others may keep reading their scores.
The next hand waits until every remaining player has left results and explicitly said ready.
A player may ready up while others are still reading; that readiness is retained.

## Blinds

Every hand opens with two forced bets, posted before any tile is dealt:

- **Small Blind**: 1% of the table's Buy-In Cap
- **Big Blind**: 2% of the table's Buy-In Cap

The offline table, which has no tiers, plays 10 / 20 on its 1,000-chip stacks (the stack is
ADR 0002's; the blinds are ADR 0004's).

- The small blind is posted by the first seat clockwise from the dealer button, the big blind
  by the next.
- **Heads-up** (two seats dealt in): the dealer button posts the small blind and the other
  seat the big blind.
- A seat whose Table Stack is smaller than its blind posts all of it and is all in (§22).
- Blinds are live bets: they count as the seat's Committed This Round on the first betting
  round, and the big blind is that round's opening Current Bet (§23).
- The big blind is also the table's **minimum bet** (§22).
- A seat that sits down mid-session is dealt in on the next hand wherever the blinds fall;
  there are no missed-blind or dead-blind rules.

## Dealer Button and Turn Order

A dealer-position marker rotates clockwise after each completed hand. The blinds move with it.

- First betting round: the first active seat clockwise from the big blind acts first, and the
  big blind acts last (§15). Heads-up, the dealer button (the small blind) acts first.
- Later betting rounds: the first remaining active seat clockwise from the dealer button acts
  first.

---

# 45. Account XP, Levels & Level-Up Coins

Progress for simply playing. A player's account holds two quest-adjacent numbers — total **XP**
and the **level** that XP is filling — alongside the Wallet (§1), which pays every level-up.

## Earning XP

Every settled hand the player reports pays XP, once per hand:

| Source | XP |
| ------ | -- |
| Playing the hand | 10 |
| Winning it | +15 |
| Word points | +1 per point of the hero's confirmed word score |

A fold-out win (no reveal) earns the 10 and the 15 but no word points. Hands earn in every
mode — offline, online, tutorial — and there is no daily cap: a claim's word score is the
number the client reports, capped by the wire validator so it cannot move XP dishonestly.

## Levels

Levels are read off the cumulative curve `100 × (level − 1)^1.5`, so every threshold is a
whole number: level 2 costs 100 XP, level 3 costs 283 in total, level 4 costs 520, level 5
800. A hand whose XP crosses several thresholds lands the player on the highest one, and each
level in between counts as reached. The player's current level shows how far into it they are
(`intoLevel` / `toNext`) on the XP bar.

## Level-Up Rewards

Each level the player *reaches* pays coins into the Wallet:

- Level 2 pays 100; every level pays `50 × level`.
- Every 5th level (5, 10, 15 …) pays double: `100 × level`.

Each level pays exactly once, ever, through the Wallet's reward-once index (`level-<n>`) — a
retried report, a replayed hand, or a server crash and heal can open that row only once. If a
crash lands between the XP commit and the wallet call, the next read of the quest state pays
any missed level before showing it.

The starting numbers in this section are the launch tuning; rebalancing is a change to the
table above and `packages/game-rules/src/xp.ts` together.
