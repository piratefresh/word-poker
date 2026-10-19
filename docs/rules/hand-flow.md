# Hand Structure & Phases

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 13. Hand Structure

A complete hand runs the following steps, in order:

1. Post Blinds and Deal Private Tiles
2. First Betting Round (Pre-Flop)
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

Every hand opens with a small blind and a big blind (§5). There is no ante.

## Offline Flow (vertical slice)

The offline game plays one hand on the client, with no server in the loop:

- Every seated player — the human and the bots — is dealt **two private tiles** (Phase 1).
- The community board is **five tiles**. All five are dealt up front; the streets only
  change how many are face up (Flop / Turn / River).
- The streets run `preflop → flop → turn → river → payout` and reveal **0 / 3 / 4 / 5**
  community tiles respectively.
- Each street runs a **real betting round** (§15, §22–§23): seats fold, check, bet, call,
  raise or shove, and the street rolls only when the round closes. Betting is from the Table
  Stack alone; the offline table seats every player on a fixed 1,000-chip stack and plays
  10 / 20 blinds, while an online table's blinds are 1% / 2% of its Buy-In Cap (§5,
  ADR 0004), and hands carry their stacks into the next hand.
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
  the bet/raise slider, and all-in behind its confirmation. Once betting ends, that row becomes
  **Submit Word** with the shared submission deadline and a reminder that submission locks
  the word. The bots build words the same way, searching their tiles against the
  table's dictionary; a bot whose tiles spell nothing the table counts confirms nothing, and
  that window ends on its clock.
- Before play the mode names the dictionary it judges against (§11), and the table does not
  deal until that list has loaded.
- `payout` is the real showdown over those words: every confirmed word is judged against the
  dictionary (§11) and scored by §7, each pot is settled by ranking its own eligible seats
  with §21's ladder — word length, then the §21.3 draw for seats
  with nothing left to compare (§25) — and the chips move into the winners' Table Stacks. A
  seat with no valid word is ranked at 0 points, exactly as §11 says.

### Offline CPU play styles

The seats keep their styles across hands: Ellis plays cautiously, Jay applies more pressure,
and Mira mixes traps and bluffs. Styles change betting tendencies, not dictionary access or
the words a seat is allowed to play. Every bot still selects its best valid word at showdown.

Betting uses the seat's own tiles, the revealed board, public commitments and Table Stacks.
A private word that improves on what everybody can make from the board supports value bets;
a high scoring word available to the whole table is not treated as a private advantage.
Before the river, complementary letters can justify a modest speculative call. Bots consider
the call's actual stack-capped cost, the share of the final pot that call would be,
the pot they can contest, opponents still in the hand,
position and the current street. Sizes scale with the big blind, pot and effective stacks.

The decision order is: consider a value wager or a situational bluff, sometimes check a
strong hand to trap, otherwise check for free, call a price the pot justifies, or fold. Bluffs
are limited to one or two opponents who can still fold. Repeated raises with non-premium
hands become less frequent. Every wager observes the engine's betting and reopen bounds.

This is a personality heuristic, not a showdown-equity estimate or an optimal poker solver.
Word-quality bands are not win probabilities. It does not infer opponents' ranges or keep
cross-hand opponent memory. Decision rolls are reproducible from the hand, seat, street,
public betting state and a purpose salt; hidden racks, future board tiles and private drafts
are excluded. The CPU continues to act one seat per beat.

The exact word search prunes dictionary prefixes that cannot form a word, with a full-search
fallback for dictionaries without prefix lookup. Both paths use the same scorer and word
tie-breaks, with no time cutoff or cache-dependent decisions. Run
`pnpm --filter @wordpoker/game-rules exec tsx scripts/benchmark-bots.ts` to measure the
seeded action mix and latency on the current machine.

---

# 14. Phase 1: Blinds and Deal

The small blind and the big blind post their forced bets (§5).

Each active player then receives two private tiles.

Private tiles:

- Are visible only to their owner
- May contain single letters
- May contain 0–2 two-letter choice tiles (§10)
- May contain tile multipliers

Players see their private tiles before making any bet.

After all private tiles have been dealt, the first betting round begins.

In a room with power-ups on ([Formats](formats.md) §40), the **Power Draw** comes first: every
seat picks the power it holds for the hand, and the first betting round begins when the draw
closes ([Power-Ups](power-ups.md) §44). The deal itself does not change — the same seed deals
the same tiles with power-ups on or off.

---

# 15. Phase 2: First Betting Round (Pre-Flop)

Players bet using only the information from their two private tiles. They do not yet know
the community tiles.

The big blind is the round's opening Current Bet. Action starts with the first active seat
clockwise from the big blind (heads-up: the small blind) and ends with the big blind.

## Facing the Big Blind or a Raise

The player may:

- Call
- Raise
- Fold
- Go All In

## The Big Blind's Option

If no one has raised when action returns to the big blind, the big blind's own bet is already
matched. The big blind may:

- Check, which closes the round
- Raise
- Go All In

## Later Betting Rounds (Flop, Turn, River)

Available actions depend on the current bet.

### When No Bet Exists

The player may:

- Check
- Bet
- Fold
- Go All In

### When a Bet Exists

The player may:

- Call
- Raise
- Fold
- Go All In

Checking is not available when the player must call an existing bet.

## Betting Turn Clock

Each betting turn has a configurable 60-second budget by default. The server owns this clock.
When a seat's turn clock expires, the seat is **folded** — whether it is idle or disconnected,
and even when it owed nothing and could have checked (ADR 0006). Chips it already committed
stay in the pot. A disconnected seat gets the same clock as a connected one before it folds
(§29). The timeout action is server-owned and cannot be sent by a client.

A pre-selected action (§36) acts the moment the turn begins, so a seat that pre-selected
Check does not time out.

<!-- In code: an expired turn folds — even a seat that owed nothing and could have checked, and
     whether the seat is idle or disconnected (ADR 0006). A disconnected seat keeps its seat and
     runs its own clock before it folds (§29). Still owed: §29's idle removal (three consecutive
     expirations) and its one-player countdown that closes the table. -->

## End of a Betting Round

The betting round ends when:

- All remaining players have contributed the same amount — and, pre-flop, the big blind has
  had its option — or
- All remaining players except one are all in, or
- Only one player remains in the hand

---

# 16. Phase 3: The Flop

The dealer reveals three community tiles.

All active players may use these tiles.

The community tiles may contain:

- Single letters
- 0–2 two-letter choice tiles (§10)
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

There are now four visible community tiles. The turn tile may be a choice tile.

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

The dealer reveals the fifth and final community tile. The river tile may be a choice tile.

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

The word is 2 to 7 letters long (§12).

## Submission Requirements

The player selects the tiles being used and arranges them into a valid word.

Choice tiles:

- Contribute one selected letter (§10)
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
be built from those tiles — a tile the seat does not hold, a choice tile with no face picked, the same
tile twice, fewer than two letters — is refused outright, and the seat may fix it until its
time runs out.

## Timeout

When time expires:

- A confirmed word is locked.
- An unconfirmed draft is never submitted: with no confirmed word, the seat scores 0 (§11).

A room that runs the auto-submit variation ([Formats](formats.md) §40) submits the draft
instead; no such room is configured today.

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
