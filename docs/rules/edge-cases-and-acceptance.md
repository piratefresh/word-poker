# Edge Cases, Acceptance Criteria & Hand Summary

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 32. Gameplay Edge Cases

## Wallet Below Buy-In

- Join is disabled when the Wallet Balance is below the bottom of the buy-in range.
- Re-Buy is disabled.
- The player may browse or join a cheaper table.

## Buy-In Cap Used Up

- Re-buys and top-ups are disabled once the player has brought the whole Buy-In Cap (§2).
- The player may keep playing their Table Stack, leave, or move up a stake tier.

## Blind Larger Than the Stack

A seat whose Table Stack is smaller than its blind posts all of it and is all in (§5). It
may win only the pots it put chips into (§25).

## Player Has Zero Stack During a Hand

A player who is all in remains eligible for the appropriate pot.

They do not take further betting actions.

## Player Folds After Betting

Previously committed chips remain in the pot.

## Player Leaves During a Hand

Voluntary leaving should normally be disabled until the hand ends.

If the client closes or disconnects:

- Disconnect rules apply (§29).
- The player is folded if their turn clock expires before they return.
- Committed chips remain in the pot.

## Server Failure During Buy-In

The buy-in transaction must be atomic.

The player must never lose Wallet Coins without receiving a seat and Table Stack.

## Server Failure During Cash-Out

The cash-out transaction must be idempotent.

Repeating the operation must not duplicate Wallet Coins.

## Table Closes

A table closes when it is empty, or when one player is left and §29's 60-second countdown
runs out. If the table is closed:

- Active hands should finish when possible.
- Remaining Table Stacks are returned to Wallets.
- Chips already committed to a pot stay in it (§29); only uncommitted Table Stacks return to
  Wallets (§28).

---

# 33. Acceptance Criteria

## Wallet and Stack

- Wallet Balance and Table Stack are stored separately.
- Wallet Balance cannot be used directly for betting.
- Every bet uses only the Table Stack.
- Winning chips are added to the Table Stack.
- Table Stacks may grow beyond the original buy-in.
- Leaving returns the remaining Table Stack to the Wallet.

## Table Buy-In

- Every table displays its stake tier, buy-in range, and blinds.
- The player chooses a buy-in inside the range.
- A buy-in cannot exceed the Wallet Balance or the remaining Buy-In Cap.
- Join is disabled when the Wallet Balance is below the bottom of the range.
- Joining deducts the chosen buy-in from the Wallet.
- Joining creates a Table Stack equal to the chosen buy-in.
- The first buy-in, re-buys, and top-ups together never exceed the Buy-In Cap.
- A confirmation modal appears before every table entry.

## Betting

- The small blind (1% of the Buy-In Cap) and big blind (2%) are posted before the deal.
- The blinds rotate with the dealer button.
- Pre-flop action starts left of the big blind and the big blind has the option to check or raise.
- The minimum bet is the big blind.
- Private tiles are dealt before betting begins.
- Players may check when no bet exists.
- Raise controls cannot exceed the Table Stack.
- All In commits the exact remaining Table Stack.
- Side pots are created when required.
- Each betting turn has a configurable 60-second budget by default.
- A seat whose turn clock expires is folded, idle or disconnected, even when it owed nothing.
- A pre-selected action (§36) acts as soon as the seat's turn begins.

## Re-Buy and Top-Up

- Re-Buy is offered when the Table Stack reaches zero; a top-up is available above zero.
- Both are available only between hands.
- Both stay within the remaining Buy-In Cap.
- Re-Buy is disabled when the Wallet Balance or the remaining cap is below the bottom of the range.

## Disconnects

- A disconnected player's turn clock runs as usual; they are folded when it expires.
- Their seat and remaining stack are preserved during the reconnect timeout.
- Reconnecting before timeout restores the player to their seat.
- Timeout removal returns the remaining uncommitted Table Stack to the Wallet.
- Chips already committed to a pot are not refunded.
- A player idle for three consecutive turns is removed when the hand ends.
- One player left starts a 60-second countdown; the table closes if no one joins.

## Scoring

- Letter values match the defined scoring table.
- Tile multipliers affect only the letters on the tile.
- Using all seven physical tiles awards a 10-point bonus.
- Two-letter tiles are choice tiles: one tile, one played letter.
- No seat's seven tiles hold more than three choice tiles.
- Words are 2 to 7 letters.
- Invalid words score zero.
- Timeout submissions score zero.
- No timer bonus is awarded.
- Ties follow the defined tie-breaker order: longest word, then the additive tile draw.

---

# 34. Complete Hand Summary

1. Players sit at a table, each choosing a buy-in inside its tier's range.
2. The buy-in moves from each player's Wallet into their Table Stack.
3. The small blind and big blind post their forced bets.
4. The dealer gives every active player two private tiles.
5. Players see their private tiles, and the first betting round begins left of the big blind.
6. Three community tiles are revealed.
7. A second betting round occurs.
8. One Turn tile is revealed.
9. A third betting round occurs.
10. One River tile is revealed.
11. The final betting round occurs.
12. Remaining players receive 60 seconds to build a word.
13. Submitted words are validated and scored.
14. The highest-scoring valid word wins the appropriate pot.
15. Winnings are added to the winner's Table Stack.
16. Players may re-buy or top up between hands, within the Buy-In Cap.
17. Players may leave between hands and return their remaining Table Stack to their Wallet.
18. The dealer-position marker and the blinds rotate, and the next hand begins.
