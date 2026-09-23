# Word Poker

The shared language of the Word Poker table: the rules engine, the wire vocabulary, and
the apps that render them. Terms below are canonical; the _Avoid_ list marks drift.

## The table

**Table Stack**: the chips a seat may bet at its table; the only balance a hand can move.
_Avoid_: balance, bankroll, chips (as a balance).

**Wallet**: the permanent account balance; pays for seats at tables and is never moved mid-hand.
_Avoid_: account balance.

**Betting Round**: one street's sequence of folds, checks, bets, calls, and raises; it ends when every remaining seat has matched the Current Bet, all but one are all in, or one seat remains.
_Avoid_: betting phase, betting street.

**Street**: one board reveal plus its betting round — preflop, flop, turn, river.

**Current Bet**: the highest amount committed by any live seat in the current betting round.
_Avoid_: high bet, pot bet.

**Committed**: the chips a seat has moved into the pot — this round (Committed This Round) or this hand (Committed This Hand).
_Avoid_: wagered, staked.

**Raise-to**: a raise stated as the round total the raiser will hold after it, not the increment.
_Avoid_: raise-by.

**Minimum Bet**: the floor for a betting round's first voluntary bet; a raise must add at least the larger of it and the last raise's increment.
_Avoid_: min raise (that's the increment), blind.

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

**Dealer Button**: the rotating marker that fixes turn order — the first live seat clockwise from it acts first; it forces no bet.
_Avoid_: dealer (that is the house).

**Word Window**: the shared 60-second phase after the final betting round where every remaining seat drafts and confirms one word.
_Avoid_: word phase, submit phase.

**Showdown**: the ranked reveal of confirmed words that decides each pot's winner.
_Avoid_: reveal (that is the UI moment).

**Busted**: a seat whose Table Stack reached zero; it sits out the session's remaining hands.
_Avoid_: broke, eliminated.

## The felt

**Hero View**: the table as one seat sees it — its rack, its turn, its draft — mapped to what the felt draws and the word builder reads; both the offline and online adapters decode into it (`apps/mobile/src/lib/hero-view.ts`).
_Avoid_: player view, client state.
