# Pot bowl Rive

Editor: https://editor.rive.app/file/pot-bowl/2635478

Runtime export: `pot-bowl.riv` (PNGs embedded). Built through the Rive MCP on 2026-10-07.
Artboard `PotBowl` is 600 × 450 with a transparent background. Draw order, back to
front: Shadow, BowlBase, Pile (10 slots), BowlFront, Flyers (5 chips). Flyers draw in
front of the lip so chips from the hero's side stay visible; they land inside the opening.
Pile and flyer chip artwork is scaled 1.5× from the original export to match the
reference's larger chips. Pile slots use 75% of their original horizontal spread
to keep the larger stacks inside the bowl; animation timing and bindings are unchanged.

## Contract

View model `PotBowl` (instance `Default`, bound to the artboard), state machine
`PotBowlMachine`. Drive it with data binding, not legacy inputs.

| Property | Type | Meaning |
| --- | --- | --- |
| `seat` | number | Direction the bet comes from, 0–5 clockwise from the hero at the bottom: 0 bottom, 1 bottom-left, 2 top-left, 3 top, 4 top-right, 5 bottom-right |
| `chipType` | number | 0 red (<50), 1 blue (50–99), 2 green (100–499), 3 purple (500–999), 4 gold (1000+) — `manifest.json` |
| `fillLevel` | number | Visible pile chips, 0–10. Each slot keeps the colour `chipType` had when it filled |
| `winnerSeat` | number | Direction the payout flies to, same 0–5 mapping |
| `reduceMotion` | boolean | Skips flights and payout; pile chips appear in place |
| `deposit` | trigger | 3 chips toss from `seat` (~670 ms), bowl squash on landing |
| `allIn` | trigger | 5 chips (~1 s), stronger bowl shake |
| `payout` | trigger | Bowl shakes, pile lifts and fades, 5 chips fly to `winnerSeat`; holds empty |
| `reset` | trigger | Back to rest; set `fillLevel` to 0 with it to clear the slots |

Host sequence: set `seat` and `chipType`, fire `deposit`/`allIn`, then raise `fillLevel`
~420 ms later (~650 ms for all-in) so the pile chip pops when the flyer lands — at once
under reduced motion. After payout, set `fillLevel` 0 and fire `reset`.

A second `deposit` from the same seat while its flight is playing is ignored; a different
seat interrupts. Verified on `@rive-app/canvas` 2.44 (web) with auto-bind.
