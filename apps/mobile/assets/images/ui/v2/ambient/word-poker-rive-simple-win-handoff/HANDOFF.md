# Codex Handoff — Word Poker Simple Winner Overlay in Rive

## Goal

Implement the first, intentionally simple Word Poker showdown winner overlay using Rive.

Use the supplied reference and layered PNGs. The table must remain visible behind the overlay. Do not turn this into a separate results route or a full-screen opaque scene.

The first version should only communicate:

- who won
- the complete winning word
- the final word score
- the pot won

Keep the animation around 1.8–2.4 seconds, then settle briefly before returning control to the table.

## Repo

Windows repo:

`E:\WebStuff\word-poker`

Suggested destination for the supplied PNGs:

`apps/mobile/assets/images/ui/v2/results/simple-win/`

Create the folder if it does not exist. Preserve the filenames from `asset-manifest.json`.

There is a Rive MCP available in the Codex session. Use it where useful to inspect/create the `.riv` file instead of manually guessing the Rive document structure.

## Important product constraints

Canonical gameplay docs live under `docs/FINAL_RULES.md` and `docs/rules/`.

Relevant behavior:

- Showdown reveals submitted words and final scores.
- Winning chips are awarded to the winner's Table Stack.
- Winner motion/highlight happens in place and keeps the table visible.
- Reduce Motion must have a non-animated/final-state path.
- Do not put gameplay authority inside Rive. Rive only visualizes already-resolved showdown data.

Do not change scoring, payout, showdown, or pot-resolution rules as part of this task.

## Supplied package

```
word-poker-rive-simple-win/
├─ HANDOFF.md
├─ asset-manifest.json
├─ reference/
│  └─ win-screen-reference.png
└─ assets/
   ├─ 01-bg-sunburst.png
   ├─ 02-celebration-starburst.png
   ├─ 03-letter-tile-blank.png
   ├─ 04-result-plaque-shell.png
   ├─ 05-winner-avatar-frame.png
   ├─ 06-winner-crown.png
   ├─ 07-pot-chip-pile.png
   ├─ 08-pot-label-blank.png
   └─ 09-winner-status-pill-blank.png
```

All visual assets are intentionally text-free. Any letters, values, score text, pot amount, and labels must be created dynamically in Rive or React Native.

## Desired composition

Portrait target first.

Approximate vertical composition:

```
[ existing table / opponents remain visible ]

          golden burst

      [ winning word tiles ]
       J O U R N E Y

        [ result plaque ]
           WINNER
         36 POINTS

        [ chip pile ]
          POT 120

       [ avatar frame ]
        winner avatar
          WINNER
```

Do not add leaves, flowers, laurel leaves, vines, or plant decorations to the celebration artwork.

The reference image is inspiration for hierarchy, not something to bake into the Rive file.

## Rive architecture

Create:

`apps/mobile/assets/rive/simple-win-result.riv`

Preferred artboard:

`SimpleWinResult`

Preferred state machine:

`Result`

Suggested hierarchy:

```
SimpleWinResult
├─ BackgroundBurst
│  ├─ Sunburst
│  └─ CelebrationStarburst
├─ WinningWord
│  ├─ Tile01
│  ├─ Tile02
│  ├─ Tile03
│  ├─ Tile04
│  ├─ Tile05
│  ├─ Tile06
│  └─ Tile07
├─ ResultPlaque
├─ Pot
│  ├─ ChipPile
│  └─ PotLabel
├─ Winner
│  ├─ AvatarFrame
│  ├─ AvatarSlot
│  ├─ Crown
│  └─ StatusPill
└─ FX
```

### Runtime data

Prefer Rive data binding/view-model properties if the installed runtime supports the needed APIs. Otherwise use the project's existing supported Rive input/text mechanism.

Desired logical data:

```ts
type SimpleWinResultData = {
  word: string;
  score: number;
  pot: number;
  winnerSeatId: string;
  isLocalWinner: boolean;
  reduceMotion: boolean;
};
```

The word is 2–7 letters. Do not bake seven visible tiles into every result. Hide unused tile instances and center the active set.

The avatar itself may remain a React Native layer if swapping arbitrary runtime avatar bitmaps inside Rive makes the implementation brittle. In that case, keep an empty/masked avatar hole in Rive and position the existing avatar component under/over the frame.

## Animation v1

Keep this deliberately restrained.

### Normal motion

Target sequence:

1. `0–150 ms`
   - overlay mounts
   - background behind celebration dims very slightly
   - sunburst fades/scales in

2. `120–600 ms`
   - winning tiles pop in from center, staggered left-to-right
   - 45–65 ms stagger
   - tiny rotation differences are fine
   - final layout forms a shallow arc

3. `450–800 ms`
   - result plaque pops in with a small overshoot
   - dynamic winner label + score become visible

4. `700–1050 ms`
   - pot/chip pile bumps upward slightly
   - avatar frame pops in
   - optional crown drops a short distance and settles

5. `1000–1500 ms`
   - one restrained sparkle/star burst
   - winner halo pulse once
   - no looping fireworks

6. `~1800–2400 ms`
   - hold readable result
   - signal completion back to React / allow dismissal according to the existing hand flow

Do not animate every element continuously. The screen should become calm after the initial hit.

### Reduce Motion

If `reduceMotion` is true:

- no staggered trajectories
- no crown drop
- no chip movement
- no scale bounce
- show the final composition immediately
- a simple opacity change/highlight is acceptable

## Dynamic tile text

Use `03-letter-tile-blank.png` as a reusable tile image.

Each tile needs dynamic:

- uppercase letter centered
- point value in the lower-right
- optional multiplier treatment only if the existing showdown UI needs it

Do not embed the word into PNGs.

For a 2-letter word, center two tiles.
For a 7-letter word, use all seven.
Keep the tile group within safe width on narrow phones.

## React Native integration

Do not rebuild the entire table in Rive.

Create a focused overlay component along the lines of:

`apps/mobile/src/components/game/results/simple-win-result-overlay.tsx`

It should:

- receive already-resolved showdown result data
- render absolute-fill above the table
- not own game rules
- not modify payout calculations
- be pointer-transparent unless the product already has a result/dismiss action
- cleanly unmount after the existing flow advances

Pseudo-shape:

```tsx
<View style={StyleSheet.absoluteFill} pointerEvents="none">
  <Rive ... />
</View>
```

If the avatar must remain React Native:

```tsx
<View style={StyleSheet.absoluteFill} pointerEvents="none">
  <WinnerAvatarOverlay ... />
  <Rive ... />
</View>
```

Use the server/shared game result as source of truth.

## Events

Useful Rive events if supported cleanly:

- `resultReadable`
- `animationComplete`

Optional later:

- `payoutMoment`

Do not block the game on fragile animation callbacks. The hand flow needs a deterministic fallback timeout.

## Acceptance criteria

- Simple winner overlay appears after a real showdown result.
- Existing table remains visible behind it.
- Full winning word is visible, 2–7 letters.
- Final score is visible.
- Pot value is visible.
- Winner avatar/seat is clearly identified.
- No leaves/flowers/laurel decorations.
- No text is baked into supplied image assets.
- Dynamic data is not hardcoded to the reference values.
- Result works for local and opponent winners.
- Result handles narrow portrait layouts.
- Reduce Motion displays a clean final state without motion.
- Rive does not determine winner/scoring/payout.
- No gameplay-rule changes.
- Relevant mobile typecheck/tests/lint still pass.

## Implementation notes

1. Inspect the repo for the existing Rive runtime/package and any current Rive components before adding dependencies.
2. If a Rive MCP can author the artboard/state machine reliably, use it.
3. Keep the `.riv` file and the RN wrapper focused on this result overlay.
4. Do not create five win tiers yet. This task is one reusable simple winner animation.
5. Do not add generic slot-machine jackpot language.
6. Avoid giant opaque panels. Preserve the tabletop as visual context.
7. If an asset does not scale cleanly, recreate that simple surface as a Rive vector rather than stretching the PNG badly.

## Nice-to-have only after v1 works

- slight score count-up
- winner halo pulse
- tile settling wobble
- subtle table impact event
- chip payout synchronization

Do not let these expand the scope of the first pass.
