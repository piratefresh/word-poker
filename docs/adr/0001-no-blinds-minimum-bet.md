# No blinds — the first voluntary bet opens at the table minimum

> **Superseded by [ADR 0004](0004-blinds.md).** Word Poker now has blinds.

Word Poker has no blinds, antes, or forced bets (§13 and §5 as they read before
[ADR 0004](0004-blinds.md)), so every betting round opens on checks until some seat
voluntarily bets. For online tables, the opening minimum is 2% of
the table's fixed buy-in: 10, 100, or 1,000 chips for the 500, 5,000, and 50,000 buy-in
presets. The server derives and publishes that value; clients do not choose it.

The offline vertical slice remains a separate fixed table setting: its 1,000-chip starting
stack uses MIN_BET = 20 chips. In both modes, raises must add at least the larger of the
table minimum and the last raise's increment — chosen over pot-relative floors because free
play needs a stable, slider-friendly step, and over larger/smaller floors so raise wars
neither stall nor end hands on the first bet.
