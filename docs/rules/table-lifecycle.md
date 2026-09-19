# Re-Buy, Leaving & Disconnects

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 27. Re-Buy Rules

A player may re-buy only when their Table Stack reaches zero.

When this happens, display:

**You are out of chips.**

[ RE-BUY ]
[ LEAVE TABLE ]

## Re-Buy Conditions

- Re-buy is allowed only between hands.
- Re-buy is never allowed during an active hand.
- The re-buy amount is always the table's fixed buy-in.
- There is no re-buy slider.
- Partial re-buys are not allowed.
- The full buy-in is deducted from the Wallet.
- The full buy-in becomes the new Table Stack.

## Example

Table buy-in: 5,000 Coins
Wallet Balance: 12,000 Coins
Table Stack: 0 Coins

After re-buy:

- Wallet Balance: 7,000 Coins
- Table Stack: 5,000 Coins

If the player's Wallet Balance is below the table buy-in:

- Re-Buy is disabled.
- The player must leave the table.
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
- They are automatically folded when action reaches them.
- They cannot win new pots after being folded.

The default reconnect timeout is three minutes.

The timeout must be configurable.

## Reconnecting Before Timeout

If the player reconnects before the timeout expires:

- They return to the same seat.
- Their Table Stack is preserved.
- They may resume during the current hand if they have not already folded.
- If auto-fold already occurred, they must wait for the next hand.

## Timeout Expiration

If the player does not reconnect before the timeout expires:

- They are removed from the table.
- Their remaining Table Stack is returned to their Wallet.
- Their seat becomes available.
- Chips already committed to an active pot remain in the pot.
- Only uncommitted remaining stack is returned.
