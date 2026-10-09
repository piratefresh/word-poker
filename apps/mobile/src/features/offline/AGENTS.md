# Offline table

Loaded when working in this folder. Repo-wide rules are in the root `AGENTS.md`.


The CPU plays one action per beat, not the whole round at once: `use-offline-game.ts` resolves a
single seat's move per `duration.cpuBeat`, each its own commit, so the chips a bot sends, its
nameplate and the pot are on the felt before the next seat moves. Never fold the bots back into
the transition that triggered them (`settleBots`-style) — a whole street played inside the hero's
tap is exactly the unreadable jump the beat exists to prevent, and it is also what made the CPU
pass block the frame (STO-371). A seat's last action is printed on its nameplate for the street
it was taken on (`seatActions` in the adapter); the engine stores what a seat committed, not the
gesture that committed it, so CHECK, CALL, BET and RAISE have nowhere else to come from. Tests
that own the table's clock advance it `duration.cpuBeat` at a time.

At a Wild table (`/offline?powers=wild`, §44) the Power Draw opens on every deal and holds the
table: nobody is on the clock, so no bot beat runs until the hero picks or `POWER_DRAW_MS` runs
out. A power used on a street rides beside that street's action in `seatActions`, and the power
UI reads the adapter's `powers` (`PowerView`, `lib/power-view.ts`) — the shape the online adapter
will fill too. Whether a power can be used is the engine's `canUsePower`, never the felt's.
Using it runs through `components/powers`: `PowerHeldChip` sits just left of the hero seat on the
felt, `usePowerTargeting` holds chip → tile → confirm (and drops to idle the moment the power
stops being usable), and while the seat chooses, `WordBuilder`'s `onPickTile` turns the strip's
taps on private tiles into picks. The swap flips in place through `swapFlip`, whose `revealed`
is the seam the "power used" card holds it on.

