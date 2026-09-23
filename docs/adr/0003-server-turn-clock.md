# Server-owned betting turn clock

> **Partly superseded by [ADR 0006](0006-betting-timeout-folds.md):** an expired turn now always folds, and a disconnected seat runs the turn clock before it folds. The rest stands.

Online betting turns use a configurable 60-second budget by default. The room owns the deadline,
and the pure game reducer receives a server-owned `timeoutTurn` action when that deadline expires.
The action auto-checks a connected seat when its committed amount already matches the current bet;
otherwise it folds. The room folds a disconnected seat before synthesizing the timeout action, so a
disconnect always folds regardless of what the seat owes.

The same budget is used by the offline reducer's turn clock. This keeps the shared engine's
deadline semantics aligned with the online table while retaining the injected clock required for
deterministic tests. A client action that arrives at or after the deadline is rejected with the
shared `turn-timeout` reason; it cannot race the server into a late bet.

The word window remains a separate shared 60-second clock. Its timeout action is still
`timeoutWords`, and clients still send only betting and word-building messages over the online
socket.

The room enforces every deadline on its own timestep loop rather than by arming Colyseus's timer
service: `onTick` compares the injected clock against the open turn, the word window, and the
payout hold, and the loop's interval is a create option (`tickMs`, 50 ms by default). A test paces
the room by choosing `tickMs` and stepping the timestep, and a failure anywhere in the tick is
logged rather than escaping the timer callback.

§29's disconnect fold is dispatched as the server-owned `foldTurn` action, not as a voluntary
`fold`. The seat is not there to act, so the deadline cannot make its fold illegal: `foldTurn` is
legal at any point of the clock, including after the deadline has passed. The connected branch
still expires through `timeoutTurn`, which refuses to auto-check before the clock has run out.

The deal seed is drawn server-side with `node:crypto`. A create caller's `seed` is honored only
behind `WORDPOKER_DETERMINISTIC_SEED=1`, because the room id is public and a client-chosen seed
must not determine the deal.

When a hand pays out and fewer than two seats can still pay another hand, the room returns the
table to `waiting` between hands: it holds each seat and its ended stack rather than dealing a
hand nobody can pay, and a seat that leaves frees its place for a newcomer. The re-buy and wallet
flows that would let a busted seat stay on are Epic B's.
