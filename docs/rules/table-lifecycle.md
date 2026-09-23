# Re-Buy, Leaving & Disconnects

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 27. Re-Buys and Top-Ups

A player may add Wallet Coins to their Table Stack between hands, by a re-buy or a top-up,
as long as the total they have brought to the table stays within the Buy-In Cap (§2).

## Re-Buy

A re-buy is offered when the player's Table Stack reaches zero.

When this happens, display:

**You are out of chips.**

[ RE-BUY ]
[ LEAVE TABLE ]

## Top-Up

A player whose Table Stack is above zero may top it up between hands.

## Conditions

- Re-buys and top-ups are allowed only between hands.
- They are never allowed during an active hand.
- The amount is chosen with the same control as joining (§4).
- A re-buy must be at least the bottom of the tier's buy-in range.
- The amount cannot exceed the player's Wallet Balance or their remaining Buy-In Cap.
- The amount is deducted from the Wallet and added to the Table Stack.

## Example

Tier: Intermediate (2,000 – 5,000, Buy-In Cap 5,000)
Brought so far: 3,000 Coins
Table Stack: 0 Coins
Wallet Balance: 12,000 Coins

The player may re-buy for 2,000 Coins at most: the cap has 5,000 − 3,000 = 2,000 left.

After re-buying 2,000:

- Wallet Balance: 10,000 Coins
- Table Stack: 2,000 Coins
- Brought so far: 5,000 Coins — the cap is used up

If the player cannot re-buy — their Wallet Balance or their remaining Buy-In Cap is below the
bottom of the range:

- Re-Buy is disabled.
- The player must leave the table, or move up to a higher stake tier.
- The seat becomes available.

---

# 28. Leaving the Table

A player may leave:

- Between hands
- After being eliminated
- After choosing not to re-buy
- After returning from a disconnect

A player cannot voluntarily remove chips during an active hand.

When leaving:

- The remaining Table Stack is transferred to the Wallet.
- The Table Stack becomes zero.
- The seat becomes available.
- The player is removed from the table.

Leaving does not reset the player's Buy-In Cap for that table session (§2).

## Example

Wallet Balance: 135,000 Coins
Table Stack: 92,000 Coins

After leaving:

- Wallet Balance: 227,000 Coins
- Table Stack: 0 Coins

The transfer must occur as one transaction to prevent lost or duplicated chips.

---

# 29. Disconnect Handling

When a player disconnects:

- Their seat remains reserved.
- Their Table Stack remains at the table.
- Their Wallet Balance is unchanged.
- The hand continues for the remaining players.

## During a Hand

- **Betting:** when action reaches the disconnected seat, its turn clock runs as usual (§15).
  If the player has not reconnected and acted when it expires, the seat is folded.
- **Word Building:** a disconnected seat that has not confirmed a word by the end of the
  window scores 0 (§11, §19).
- Chips already committed to the pot stay in the pot.
- A folded seat cannot win the current hand's pots.

## Reconnecting

The default reconnect timeout is three minutes. The timeout must be configurable.

If the player reconnects before the timeout expires:

- They return to the same seat.
- Their Table Stack is preserved.
- They may resume during the current hand if they have not been folded.
- If they were folded, they wait for the next hand.

## Timeout Expiration

If the player does not reconnect before the timeout expires:

- They are removed from the table.
- Their remaining Table Stack is returned to their Wallet.
- Their seat becomes available.
- Chips already committed to an active pot remain in the pot.
- Only uncommitted remaining stack is returned.

## Idle Players

A player is **idle** when their turn clock has expired on three consecutive betting turns
(the number is configurable), whether they are connected or not.

- An idle player is removed from the table when the current hand ends.
- Their remaining Table Stack is returned to their Wallet.
- Their seat becomes available.

## Table Closing

- **One player left:** when only one player remains seated, a 60-second countdown begins. If
  no other player joins before it ends, the table closes.
- **No players left:** a table with no seated players closes.
- When a table closes, any remaining player keeps their chips: their Table Stack is returned
  to their Wallet, as if they had left (§28).
- A closed table ends its table session; the Buy-In Cap resets with the next session (§2).

<!-- In code: a disconnected seat keeps its seat and runs its own turn clock, folding when that
     clock expires rather than as soon as action reaches it (ADR 0006); a seat that is really
     gone — a clean leave, or a reconnect hold that has run out — is folded out of a running hand.
     Still owed: idle removal (three consecutive expirations), the one-player countdown and table
     closing, top-ups, and the Buy-In Cap. -->
