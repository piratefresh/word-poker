# Power-Ups

Part of the [Word Poker rules](../FINAL_RULES.md).

---

# 44. Power-Ups

A power-up is a one-shot ability a seat holds for one hand. A room turns power-ups on as a
table setting ([Formats](formats.md) §40); a room with them off plays the rules as written,
and nothing below applies to it.

A power is **received** at the Power Draw and **used** inside its own activation window. There
is no cooldown and no account-level timer: nothing about a power depends on an earlier hand or
an earlier game. Scarcity lives inside the hand — one power per seat, and a decision on every
street about whether to burn it now or hold it.

## Deal Modes

The room's deal mode decides how powers are dealt: Classic (none, the default) or Wild (a Power
Draw every hand). §40 lists them, with the modes planned beyond these two.

## The Power Draw

With Wild on, the hand runs:

Blinds → Deal → **Power Draw** → Pre-Flop → Flop → Turn → River → Word Building → Showdown

- The Power Draw follows §14's deal, so every seat sees its private tiles before it picks.
- It is a window at the start of the pre-flop, the same way the word window (§19) sits inside
  the river: it is not a street of its own, and nobody bets during it. The pre-flop's first
  betting turn (§15) — and its turn clock — starts when the draw closes.
- Every seat in the hand draws at the same time. Each is offered **3 powers** from the room's
  pool and **keeps 1**.
- The draw has its own clock: **10 seconds**, shared by every seat. It closes as soon as every
  seat has picked, without waiting the clock out.
- A seat that has not picked when the clock runs out keeps the **first** power it was offered.
- The offers are drawn by weight, without replacement, so a seat is never offered the same power
  twice. A rarer power has a lower weight and turns up among the three less often. When the
  pool holds 3 powers or fewer, every power in it is offered.
- The offers and the pick are **private**: no other seat sees them. In Wild every seat holds a
  power, so holding one says nothing.

## The Held Power

- The kept power is held **for this hand only**.
- It is used at most once.
- An unused power is lost when the seat folds or when the hand ends. Nothing carries over to
  the next hand.

## Activation Windows

Each power names the window in which it can be used. Every v1 power shares one window:

- During a betting round (pre-flop to river), **only on the seat's own betting turn**, before
  it acts. Using the power does not end the turn: the seat still checks, calls, bets, raises or
  folds afterwards, and the turn clock (§15) keeps running while it decides.
- During the word window (§19), **at any time before the seat confirms** its word.

A seat that is all in has no betting turns left, so it can still use its power in the word
window. A power is refused after the seat folds and after it confirms its word.

## The v1 Powers

Every v1 power belongs to one family, **Swap a Private Tile**: the seat discards one of its
private tiles and receives a new plain tile in its place. Only the source of the new letter
differs.

| Power | Tag | New letter comes from | Draw weight |
| ----- | --- | --------------------- | ----------: |
| Random Wild | WILD | Any letter A–Z, each equally likely | 10 |
| Vowel Magnet | VOWEL | A, E, I, O or U, each equally likely | 8 |
| Mulligan | MULLIGAN | The next tile of this hand's shuffled bag after the community tiles | 8 |

The tag is what the seat's nameplate prints when the power is used (see Visibility).

Mulligan changes nobody else's tiles. The deal lays out every seat's private tiles and all five
community tiles before the first bet (§14), so the tile it takes is one no other seat can ever
be dealt this hand. The bag holds single letters only (§6), so that tile is already a plain
letter. When more than one seat uses Mulligan in the same hand, each takes a different tile: the
first seat at the table takes the first tile after the community, the second seat the next, and
so on. The seat decides which tile, not the order in which the powers are used.

## Swapping a Tile

These rules hold for every power in the Swap a Private Tile family:

- Only a **private** tile can be swapped. Community tiles are never touched.
- The new tile is a **plain single-letter tile**: it carries §6's value for its letter (Q is
  10), no multiplier (§9), and it is never a choice tile (§10). It inherits nothing from the
  discarded tile, so swapping away a multiplier or a choice tile gives those up. That is part
  of the price.
- The new letter can be the same as the discarded one. The draw does not avoid it.
- Random Wild and Vowel Magnet do not take their letter from the bag.
- If the discarded tile was in the seat's draft word, it leaves the draft. The new tile takes
  the discarded tile's place in the seat's rack, unselected.
- The discarded tile is never shown to anyone, not even at showdown.

## Randomness

- The offers and the new letters come from their own seeded draws, never from the deal's.
  A hand deals **exactly the same tiles** with power-ups on or off.
- A seat's new letter is fixed by the hand and the seat when the hand is dealt. It does not
  depend on the street the power is used on, and asking again cannot roll it again.
- The seeds stay with the server, so no player can predict an offer or a letter.

## Visibility

**The use is public, the result is private.**

- When a seat uses a power, every seat at the table — the user's own included — sees a power
  card in the middle of the felt: the power's name, its description, and the name of the
  player who used it. The card then clears.
- The seat's nameplate shows the power's tag for the street it was used on, beside that
  street's action (CHECK, CALL, BET, …).
- Only the seat's owner sees the new letter: once the card clears, the discarded tile turns
  over to the new one in their rack.
- At showdown (§20), a swapped tile the seat played carries a small ⚡ marker, so the table
  can see a power helped build the word — but not what the tile was before.

## Offline Play

At an offline Wild table, every seat dealt in draws and holds a power, including CPU and all-in
seats (§13). After the player picks, CPUs choose in seat order, one pick per CPU beat. Until
every seat picks or the shared draw clock runs out, nobody is on the betting clock. The timeout
preserves existing picks and keeps the first offer for each seat still choosing.

CPU choices are seeded and use only their own tiles, the revealed board and public betting
state. They weigh their offers by rack fit and personality, then may use their held power on
their own turn or in §19's window before confirming. They prefer swapping a private tile outside
their best current word, otherwise their lowest printed-value tile. A use takes its own beat;
the next beat recomputes the bet or word from the changed rack. It never renews the clock and
does not guarantee a better word. The public card, street tag and showdown marker follow the
same visibility rules as the player's; CPU offers, held powers and swap results remain private.

## Open Questions

- Whether the draw keeps its own 10-second clock or reuses the betting turn clock.
- Whether a held power should show face-down on the nameplate once deal modes exist in which
  holding one is information (Sparse, §40).
