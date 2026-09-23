# Stake tiers with a buy-in range and a Buy-In Cap

Replaces the fixed buy-in of §2 as it read before this ADR ("no ranges, no slider"). The
product spec gives stake tiers with ranges (Low: $10–$50) and says the listed buy-in is the
most a player can have in play at that table, "even across rebuys or top-ups".

A table belongs to a tier with a buy-in range; the player picks an amount inside it, and the
top of the range is the Buy-In Cap: the most Wallet Coins that player may move onto the table
in one table session, counting the first buy-in, re-buys, and top-ups together. Leaving and
rejoining does not reset it; the session ending does. Winnings are not capped — reading the
cap as a ceiling on the stack itself would stop a winning player from playing their winnings.
Top-ups between hands are now allowed, since the spec names them. The Coin tiers keep their
old buy-ins as caps (500 / 5,000 / 50,000), with a floor of 20 big blinds.
