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
- Each street runs a **real betting round** (§15, §22–§23): seats fold, check, bet, call,
  raise or shove, and the street rolls only when the round closes. Betting is from the Table
  Stack alone; the offline table seats every player on a fixed 1,000-chip stack with a
  20-chip minimum bet (ADR 0002), and hands carry their stacks into the next hand.
- The river's round closes into **Word Building** (§19) instead of paying out: every seat
  still in the hand shares one 60-second window to draft and confirm a word, and the hand
  pays out once every seat has confirmed or run out of time.
- A fold-out (§26) ends the hand at the pot: no window opens, no word is judged, and the
  surviving seat is paid in the same beat as the fold that left it alone.
- An all-in run-out shows no betting rounds on the streets left to come — with nobody able
  to act, the hand rolls straight to §19's window once the last round closes.
- A seat whose stack reaches zero sits the session out: it is dealt no more hands, keeps its
  seat at $0 with a BUSTED marker, and the session ends when the hero busts or fewer than two
  seats can still play — New game restarts with fresh stacks and a fresh seed (ADR 0002).
- The word builder is on screen the whole hand: a seat drags or taps tiles from its rack and
  the board into the word band, reads §11's reason when the draft cannot stand, and confirms
  inside §19's window. The felt's own row is the whole control surface — fold, check/call,
  the bet/raise slider, and all-in behind its confirmation — and the check doubles as the
  window's confirm. The bots build words the same way, searching their tiles against the
  table's dictionary; a bot whose tiles spell nothing the table counts confirms nothing, and
  that window ends on its clock.
- Before play the mode names the dictionary it judges against (§11), and the table does not
  deal until that list has loaded.
- `payout` is the real showdown over those words: every confirmed word is judged against the
  dictionary (§11) and scored by §7, each pot is settled by ranking its own eligible seats
  with §21's ladder — word length, then highest printed letter, then the §21.3 draw for seats
  with nothing left to compare (§25) — and the chips move into the winners' Table Stacks. A
  seat with no valid word is ranked at 0 points, exactly as §11 says.

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

The window is shared: every remaining seat has the same sixty seconds, not sixty of its own.
The hand moves on to the showdown once every remaining seat has either confirmed a word or run
out of time — and it moves as soon as every seat has confirmed, without waiting the clock out.

A submission is accepted for what it plays, not for what it spells. A word that can be built
from the seat's tiles is locked once the seat confirms it, even when it is not in the
dictionary: that word scores 0 (§11) rather than unlocking the seat. A submission that cannot
be built from those tiles — a tile the seat does not hold, a split two-letter tile, the same
tile twice, fewer than two letters — is refused outright, and the seat may fix it until its
time runs out.

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

The showdown produces an ordered ranking, not only a winner: every remaining seat is placed by
final score, and equal scores are broken by the tie-breaker ladder in
[Betting, Pots & Tie-Breakers](betting-and-pots.md) §21.
