# Hand Structure & Phases

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 13. Hand Structure

A complete hand contains the following phases:

1. Deal Private Tiles
2. First Betting Round
3. Flop
4. Second Betting Round
5. Turn
6. Third Betting Round
7. River
8. Final Betting Round
9. Word Building
10. Showdown
11. Pot Award
12. Next Hand

There are no blinds or antes.

## Offline Flow (vertical slice)

The offline game plays one hand on the client, with no server in the loop:

- Every seated player — the human and the bots — is dealt **two private tiles** (Phase 1).
- The community board is **five tiles**. All five are dealt up front; the streets only
  change how many are face up (Flop / Turn / River).
- The streets run `preflop → flop → turn → river → payout` and reveal **0 / 3 / 4 / 5**
  community tiles respectively.
- Betting, word building, and showdown are out of this slice, so the walk from street to
  street is the whole round: every seat takes its turn in order, and the last seat's turn
  rolls the street. `payout` scores the tiles by total points — no dictionary yet.

---

# 14. Phase 1: Deal Private Tiles

Each active player receives two private tiles.

Private tiles:

- Are visible only to their owner
- May contain single letters
- May contain two-letter tiles
- May contain choice tiles
- May contain tile multipliers

Players see their private tiles before making any bet.

After all private tiles have been dealt, the first betting round begins.

---

# 15. Phase 2: First Betting Round

Players bet using only the information from their two private tiles.

Available actions depend on the current bet.

## When No Bet Exists

The player may:

- Check
- Bet
- Fold
- Go All In

## When a Bet Exists

The player may:

- Call
- Raise
- Fold
- Go All In

Checking is not available when the player must call an existing bet.

The betting round ends when:

- All remaining players have contributed the same amount, or
- All remaining players except one are all in, or
- Only one player remains in the hand

---

# 16. Phase 3: The Flop

The dealer reveals three community tiles.

All active players may use these tiles.

The community tiles may contain:

- Single letters
- Two-letter tiles
- Choice tiles
- Double Letter tiles
- Triple Letter tiles

A new betting round begins after the reveal.

Available actions include:

- Check
- Bet
- Call
- Raise
- Fold
- All In

---

# 17. Phase 4: The Turn

The dealer reveals one additional community tile.

There are now four visible community tiles.

A new betting round begins.

Players may:

- Check
- Bet
- Call
- Raise
- Fold
- Go All In

---

# 18. Phase 5: The River

The dealer reveals the fifth and final community tile.

Players now have access to:

- Two private tiles
- Five community tiles

A final betting round begins.

Players may:

- Check
- Bet
- Call
- Raise
- Fold
- Go All In

After betting is complete, the hand moves to Word Building.

---

# 19. Phase 6: Word Building

Remaining players receive 60 seconds to create and submit their best word.

Players may use:

- Only private tiles
- Only community tiles
- A mixture of private and community tiles

Players do not have to use a private tile.

Players do not have to use every community tile.

## Submission Requirements

The player selects the tiles being used and arranges them into a valid word.

Two-letter sequence tiles:

- Must use both letters
- Must preserve their printed order
- Cannot be split

Choice tiles:

- Contribute one selected letter
- Must clearly show which option the player selected

The player may edit their submission until:

- They confirm it, or
- The 60-second timer expires

There is no bonus for submitting early.

## Timeout

When time expires:

- A confirmed word is locked.
- An unconfirmed draft may be automatically submitted only if the game explicitly supports auto-submit.
- Otherwise, no confirmed word results in 0 points.

The preferred default is that the player must confirm their word before time expires.

---

# 20. Phase 7: Showdown

All remaining players reveal their submitted words.

Each submission displays:

- Submitted word
- Tiles used
- Base letter score
- Tile multiplier bonuses
- Full Rack Bonus
- Final score
- Validation result

The valid word with the highest final score wins the pot.

Folded players do not participate in the showdown.
