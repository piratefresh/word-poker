# No blinds — the first voluntary bet opens at a fixed minimum

Word Poker has no blinds, antes, or forced bets (§13, §5), so every betting round opens
on checks until some seat voluntarily bets. We fixed that opening at MIN_BET = 20 chips
(2% of the 1,000-chip offline starting stack) as a table setting, with raises required
to add at least the larger of MIN_BET and the last raise's increment — chosen over
pot-relative floors because free play needs a stable, slider-friendly step, and over
larger/smaller floors so raise wars neither stall nor end hands on the first bet.
