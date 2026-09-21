# Edge Cases, Acceptance Criteria & Hand Summary

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 32. Gameplay Edge Cases

## Wallet Below Buy-In

- Join is disabled.
- Re-Buy is disabled.
- The player may browse or join a cheaper table.

## Player Has Zero Stack During a Hand

A player who is all in remains eligible for the appropriate pot.

They do not take further betting actions.

## Player Folds After Betting

Previously committed chips remain in the pot.

## Player Leaves During a Hand

Voluntary leaving should normally be disabled until the hand ends.

If the client closes or disconnects:

- Disconnect rules apply.
- The player is auto-folded.
- Committed chips remain in the pot.

## Server Failure During Buy-In

The buy-in transaction must be atomic.

The player must never lose Wallet Coins without receiving a seat and Table Stack.

## Server Failure During Cash-Out

The cash-out transaction must be idempotent.

Repeating the operation must not duplicate Wallet Coins.

## Table Closes

If the table is closed:

- Active hands should finish when possible.
- Remaining Table Stacks are returned to Wallets.
- Committed pots are resolved or safely refunded according to server recovery rules.

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

- Every table displays one fixed buy-in amount.
- Every player pays the exact same buy-in.
- No buy-in range is shown.
- No buy-in slider is shown.
- Players cannot choose a custom amount.
- Join is disabled when Wallet Balance is below the buy-in.
- Joining deducts the exact buy-in from the Wallet.
- Joining creates a Table Stack equal to the buy-in.
- A confirmation modal appears before every table entry.

## Betting

- There are no blinds.
- There are no forced opening bets.
- Private tiles are dealt before betting begins.
- Players may check when no bet exists.
- Raise controls cannot exceed the Table Stack.
- All In commits the exact remaining Table Stack.
- Side pots are created when required.
- Each betting turn has a configurable 60-second budget by default.
- An idle connected seat auto-checks when it owes nothing and auto-folds when it owes chips.
- A disconnected seat auto-folds when action reaches it.

## Re-Buy

- Re-Buy is available only when the Table Stack reaches zero.
- Re-Buy is available only between hands.
- Re-Buy always uses the table's fixed buy-in.
- Re-Buy does not have a slider.
- Re-Buy is disabled when the Wallet Balance is below the buy-in.

## Disconnects

- Disconnected players are automatically folded when action reaches them.
- Their seat and remaining stack are preserved during the reconnect timeout.
- Reconnecting before timeout restores the player to their seat.
- Timeout removal returns the remaining uncommitted Table Stack to the Wallet.
- Chips already committed to a pot are not refunded.

## Scoring

- Letter values match the defined scoring table.
- Tile multipliers affect only the letters on the tile.
- Using all seven physical tiles awards a 10-point bonus.
- Two-letter tiles count as one physical tile.
- Two-letter sequence tiles cannot be split.
- Invalid words score zero.
- Timeout submissions score zero.
- No timer bonus is awarded.
- Ties follow the defined tie-breaker order.

---

# 34. Complete Hand Summary

1. Players sit at a table using the same fixed buy-in.
2. The buy-in moves from each player's Wallet into their Table Stack.
3. The dealer gives every active player two private tiles.
4. Players see their private tiles.
5. The first betting round begins with no forced bet.
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
16. Players with zero chips may re-buy between hands.
17. Players may leave between hands and return their remaining Table Stack to their Wallet.
18. The dealer-position marker rotates and the next hand begins.
