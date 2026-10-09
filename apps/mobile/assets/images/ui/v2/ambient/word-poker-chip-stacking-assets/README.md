# Word Poker: Rive poker chip stacking assets

Each transparent PNG is its own image file. No bowl is included.

## Single chips
- poker-chip-red-under-50.png — bet < 50
- poker-chip-blue-50-to-99.png — bet 50–99
- poker-chip-green-100-to-499.png — bet 100–499
- poker-chip-purple-500-to-999.png — bet 500–999
- poker-chip-gold-1000-plus.png — bet >= 1000

## Stack presets
- poker-chip-stack-purple-03.png — short stack (3 visible chips)
- poker-chip-stack-purple-05.png — medium stack (5 visible chips)
- poker-chip-stack-purple-07.png — tall stack (7 visible chips)

## Rive setup suggestion
Animate individual chips dropping into columns, vertically offsetting each new sprite. Keep each column anchored to its bottom so stacks grow upward. Alternatively crossfade/swap the preset stack images for discrete fill levels.

Note: the ready-made stack presets are purple. For stacks of other colors, layer the corresponding single-chip assets in Rive.

## Built file: `../the-pot-chips-stack.riv`

Editor: https://editor.rive.app/file/the-pot-chips-stack/2641206 — built through the Rive MCP.
Chips are the single-chip PNGs downscaled to 384 px and embedded (~750 KB).

Artboard `PotStacks` (360 × 220, transparent), state machine `PotStacksMachine`, view model
`PotBowl` (instance `Default`). Ten slots in three bottom-anchored columns (fill order: centre,
left, right, then up a row; slot 9 tops the centre). Chips keep uniform scale; each row sits
22 px (one rim) above the last.

| Property | Type | Meaning |
| --- | --- | --- |
| `fillLevel` | number | Visible chips, 0–10. A slot drops in as it passes, and hides when it falls back |
| `chip0`–`chip9` | number | Each slot's colour: 0 red, 1 blue, 2 green, 3 purple, 4 gold. Set it before raising `fillLevel` |
| `reduceMotion` | boolean | Slots appear in place instead of dropping |
| `payout` | trigger | Stacks lift and fade out |
| `reset` | trigger | Stacks back to rest; lower `fillLevel` first to clear slots |

`seat`, `chipType`, `winnerSeat`, `deposit` and `allIn` are still on the view model for the host
but drive nothing in this file.
