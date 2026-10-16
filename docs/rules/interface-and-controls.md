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

## Results Tiles

Results cards show each played tile at the small size. Double-letter and triple-letter tiles keep
the shared gold `2×` and red `3×` badges, floating just outside the top-left corner so the badge
does not cover the letter. Choice-face chips remain below the tile.

---

# 31. Betting Control Requirements

The primary button combines Check, Call, Bet, and Raise. Each turn starts with the slider at
its leftmost position: the button shows Check when checking is legal, or Call with the chips
owed when facing a bet. Moving the slider selects a legal Bet amount or Raise To round total;
returning it to the left restores Check or Call. The label and tap use the same action.
During the word-confirm window, Check still confirms the word. Fold and All In remain separate.

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
