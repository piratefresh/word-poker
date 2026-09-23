# A betting turn that times out always folds

Supersedes ADR 0003's timeout outcome (auto-check when nothing is owed) and its immediate fold
of a disconnected seat. The product spec says any expired betting timer auto-folds, idle or
disconnected, "consistent with the existing reveal-phase timeout rule", and that a
disconnected player is folded only when they "cannot act within the allowed time".

So an expired turn folds even when the seat owed nothing, and a disconnected seat runs the
same turn clock as a connected one before it folds — the room no longer folds it the moment
action reaches it. Auto-checking was the kinder, more poker-standard option; the spec's author
chose fold deliberately, and pre-selected actions (§36) are how a player who wants to check
avoids the clock. ADR 0003's clock ownership, its timestep loop, and its seed rules stand.
