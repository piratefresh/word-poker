# Seated Interface & Betting Controls

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 30. Seated Table Interface

The seated game view displays:

## Player Information

- Anonymous seat label and neutral avatar — never the player's username or chosen avatar (§37)
- Seat position
- Connection status
- Folded status
- All-in status
- Remaining Table Stack
- Small blind and big blind markers
- Last action this street

## Local Player Information

- Private tiles
- Current Table Stack
- Amount committed this round
- Total amount committed this hand
- Available actions
- Word-building timer when active

## Table Information

- Pot Size
- Side Pots
- Current Bet
- Blinds
- Community Tiles
- Current phase
- Active player
- Dealer-position marker
- Dictionary
- Stake tier and buy-in range

Wallet Balance may be shown in a secondary location, but it must not appear as part of the available betting balance.

---

# 31. Betting Control Requirements

## Fold

- Ends the player's participation in the current hand.
- Chips already committed remain in the pot.
- Cannot be undone.

## Check

- Available only when the player does not need to call a bet.
- Pre-flop, available to the big blind when no one has raised (§15).
- Passes action without adding chips.

## Bet

- Available when no Current Bet exists.
- Creates the Current Bet.

## Call

- Matches the Current Bet.
- Uses only the Table Stack.

## Raise

- Increases the Current Bet.
- Cannot exceed the player's remaining Table Stack.
- Must meet the minimum raise (§22) unless the player is going all in.

## All In

- Commits the player's exact remaining Table Stack.
- May be less than a full call or minimum raise.
- May create side pots.
