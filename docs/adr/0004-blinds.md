# Blinds: small 1% and big 2% of the Buy-In Cap

Supersedes ADR 0001. The product spec (docs/PRODUCT_SPEC.md, Phase 1) opens every hand with a
small and a big blind, and its pre-flop offers only fold, call, and raise — no check, because
a bet is already on the table. ADR 0001's no-blinds table let every seat check through to the
word window for free, so a hand could be played for nothing.

The spec gives no amounts. The small blind is 1% and the big blind 2% of the table's Buy-In
Cap (5 / 10, 50 / 100, 500 / 1,000 on the three Coin tiers; 10 / 20 on the offline table's
1,000-chip stacks). The big blind equals ADR 0001's old minimum bet, so the raise floor and
the slider's step do not move; it stays the minimum bet, and a raise still adds at least the
larger of it and the last raise's increment. Blinds follow the usual poker positions: the two
seats clockwise from the button, the button posts the small blind heads-up, and the big blind
has the option pre-flop. There are no missed-blind or dead-blind rules — a newcomer is dealt
in wherever the blinds fall — to keep a casual table simple.
