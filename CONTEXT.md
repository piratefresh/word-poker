# Word Poker

The shared language of the Word Poker table: the rules engine, the wire vocabulary, and
the apps that render them. Terms below are canonical; the _Avoid_ list marks drift.

## The table

**Table Stack**: the chips a seat may bet at its table; the only balance a hand can move.
_Avoid_: balance, bankroll, chips (as a balance).

**Wallet**: the permanent account balance; pays for seats at tables and is never moved mid-hand.
_Avoid_: account balance.

**Stake Tier**: a table's stakes — its buy-in range, its Buy-In Cap, and its blinds.
_Avoid_: level, room size.

**Buy-In Cap**: the top of a tier's buy-in range; the most Wallet Coins a player may move onto one table in a table session, across the first buy-in, re-buys, and top-ups. Winnings are not capped.
_Avoid_: max buy-in (it covers re-buys too), stack cap.

**Betting Round**: one street's sequence of folds, checks, bets, calls, and raises; it ends when every remaining seat has matched the Current Bet, all but one are all in, or one seat remains.
_Avoid_: betting phase, betting street.

**Street**: one board reveal plus its betting round — preflop, flop, turn, river.

**Current Bet**: the highest amount committed by any live seat in the current betting round.
_Avoid_: high bet, pot bet.

**Committed**: the chips a seat has moved into the pot — this round (Committed This Round) or this hand (Committed This Hand).
_Avoid_: wagered, staked.

**Raise-to**: a raise stated as the round total the raiser will hold after it, not the increment.
_Avoid_: raise-by.

**Small Blind / Big Blind**: the two forced bets posted before the deal by the two seats clockwise from the Dealer Button — 1% and 2% of the Buy-In Cap. The big blind is the first betting round's opening Current Bet.
_Avoid_: ante (every seat pays an ante; Word Poker has none).

**Minimum Bet**: the floor for a betting round's first bet — the big blind; a raise must add at least the larger of it and the last raise's increment.
_Avoid_: min raise (that's the increment).

**Fold**: a seat's surrender of the pot; its committed chips stay in.
_Avoid_: drop, quit.

**Fold-out**: a hand won without a showdown because every other seat folded; no reveal, no word.
_Avoid_: walk-over, default win.

**All In**: committing the seat's exact remaining Table Stack. A Short Call is an all-in that could not cover the Current Bet.
_Avoid_: shove (in UI copy), push.

**Main Pot / Side Pot**: the layered pots an all-in hand splits its committed chips into; each is contested only by its Eligible seats.
_Avoid_: split pot (that is a tie, not a layer).

**Eligible**: describes a seat that may win a given pot — still in the hand and committed at least the pot's level.
_Avoid_: active (that is turn-taking).

**Payout**: the settlement that ranks each pot's eligible seats, awards the chips, and moves them into Table Stacks.

## The hand

**Dealer Button**: the rotating marker that fixes the blinds and turn order — the two seats clockwise from it post the blinds, and after the flop the first live seat clockwise from it acts first.
_Avoid_: dealer (that is the house).

**Choice Tile**: a two-letter tile (A/E, Q/K) that plays exactly one of its faces; the only kind of two-letter tile.
_Avoid_: double tile, sequence tile (retired: ADR 0005).

**Word Window**: the shared 60-second phase after the final betting round where every remaining seat drafts and confirms one word.
_Avoid_: word phase, submit phase.

**Showdown**: the ranked reveal of confirmed words that decides each pot's winner.
_Avoid_: reveal (that is the UI moment).

**Busted**: a seat whose Table Stack reached zero; it sits out the session's remaining hands.
_Avoid_: broke, eliminated.

**Power-Up**: a one-shot ability a seat holds for one hand, in a room whose deal mode deals them (§44). Every power is defined once, in the contracts' catalog.
_Avoid_: perk, boost, ability (in UI copy).

**Deal Mode**: the room setting that decides how power-ups are dealt — Classic (none) or Wild (a Power Draw every hand).
_Avoid_: power mode, cooldown (powers have none).

**Power Draw**: the window after the deal and before the first bet where every seat is offered three powers and keeps one.
_Avoid_: power phase (it is a window, not a phase), roll.

**Held Power**: the power a seat kept at the Power Draw; lost unused at a fold or the end of the hand.

## The felt

**Hero View**: the table as one seat sees it — its rack, its turn, its draft — mapped to what the felt draws and the word builder reads; both the offline and online adapters decode into it (`apps/mobile/src/lib/hero-view.ts`).
_Avoid_: player view, client state.
