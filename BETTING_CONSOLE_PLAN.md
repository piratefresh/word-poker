# Betting Console — Tavern Skin for the Action Row

## Context

The felt's action row (`apps/mobile/src/components/screens/game/betting/`) is drawn entirely in views:
a thin gold slider with a `RAISE` label and a number, then a row of four `GameButton`s: FOLD · CHECK/CALL ·
RAISE · ALL IN. The new art (sprite sheet + full-screen mockup) puts the row in a wood-and-felt **console**:
a power slot on the left, a MIN/MAX slider with a spade-coin thumb and a purple amount bubble, three
struck buttons under it, and a large beer-mug **CHECK** button that hangs off the right end.

The codebase already knows how to draw painted art. `community-strip.tsx` and `hud/top-bar/banner.ts`
render one picture scaled uniformly and place live content inside rects measured in the picture's own
pixels. `chip-sprite.tsx` clips frames out of an atlas with `expo-image`. The console follows the same
pattern: **painted, text-free art, with live text and touch handling drawn on top.** We add no new
dependency and no Skia canvas (the web's WebGL context cap is why `GameButton` uses views; images avoid
the cap too).

The game logic does not change. `BettingState` already carries everything the console prints (`minRaise`,
`maxRaise`, `callAmount`, `primary`, `wager`, `allInAmount`).

## Decisions

| Topic | Decision |
|---|---|
| Rendering | `expo-image` pictures scaled by one factor (console width ÷ art width) and positioned from picture-pixel rects in a `console-art.ts`, as `banner.ts` does. No nine-slice: RN's `capInsets` is iOS-only. |
| Text | All lettering is live `Text` in `fonts.arcade` (Lilita One, already loaded) with a dark `textShadow`. The art carries no words or numbers. |
| Mug button | The check/call/confirm action (`state.primary`), with `testID="action-check-call"`. It's the most-pressed control, so it gets the biggest target. This matches `controller-sketch.png`. |
| Button row | FOLD (red) · ALL IN (dark) · BET/RAISE (gold, amount over label). The mockup's dark "$20 CALL" would repeat the mug, so ALL IN takes the dark slot. This keeps all-in reachable when a short stack can't make a min raise and the slider is disabled. **Open: confirm, or say what the dark slot should be.** |
| Slider | Keep `raise-slider.tsx`'s responder logic and `adjustable` a11y; only the visuals change. `@expo/ui`'s Slider can't take a painted track or thumb. |
| Fill | The green pill is drawn full length inside a `View` with `overflow: hidden` and `width: progress%`. The cut end hides under the thumb, so no stretching art is needed. |
| States | Pressed: the face sinks 2 pt and darkens (an overlay view). Disabled: `opacity.disabled`. No extra art per state. |
| Unchanged | Shuffle and `CHECK 5/5` under the rack: `GameButton`'s `dark` slab already matches the sheet's dark buttons. |
| Deferred | The **raise-presets dropdown** (½ Pot / Pot / 2× Pot / All In). It isn't in the target mockup, it needs `pot` in `BettingState`, and it needs a rule for what "pot" means as a raise-to (`docs/rules/`). Add it when wanted. |
| Tracking | One story in **Word Poker Native** under the current epic, with the steps below as its checklist. |

## Assets needed

Every piece must be **its own file**: transparent background, **no lettering or numbers**, tightly cropped
(no transparent margin), WebP-with-alpha or PNG, and **clean alpha edges**. The attached sheet has
red/orange halos around the console, slider and buttons from background removal; those halos would show
on the felt. Sizes are the minimum for a crisp result at the desktop scale (`MAX_SCALE` 1.6).

| # | File (`assets/images/ui/console/`) | What | Min size (px) | In the sheet already? |
|---|---|---|---|---|
| 1 | `console.webp` | The wood + gold-rim + felt tray **with no slots, slider, coin or mug painted in**: just the empty felt panel on its wood base. The right end can stay plain; the mug sits over it. | 1800 wide | No. The sheet's console has the square, slider, coin and circle baked in. |
| 2 | `slot-square.webp` | The gold-framed felt square (the power's slot). Code places it, so a Classic table (no power) can leave it out. | 300 | Yes, standalone at the right of row 1 (needs a clean edge and more resolution). |
| 3 | `track.webp` | The empty cream slider pill. | 1200 wide | Yes (row 2, third pill), but only ~290 px. Needs a high-res export. |
| 4 | `fill.webp` | The green fill pill, same size and shape as the track's inside. | 1200 wide | Yes (row 2, first pill), at low resolution. |
| 5 | `thumb.webp` | The spade coin **on its own**. | 256 | No. It's only painted onto the slider. |
| 6 | `bubble.webp` | The purple amount bubble with its tail, blank. | 600 wide | Yes, blank (bottom middle). Needs a clean edge and more resolution. |
| 7 | `mug.webp` | The beer-mug round button, **blank** (no "CHECK"). Foam and rim as drawn. | 512 | No. "CHECK" is baked in. |
| 8 | `button-red.webp` | FOLD's red slab, blank. | 600 wide | No. Lettering is baked in. |
| 9 | `button-dark.webp` | The charcoal slab, blank. | 600 wide | No. Lettering is baked in. |
| 10 | `button-gold.webp` | The gold slab, blank. | 600 wide | No. Lettering is baked in. |

Buttons 8–10 should share **one size and aspect** so they line up in one row. Not needed: the standalone
circle frame (the mug has its own rim), the gold pill, the dark shuffle/check buttons, the MIN/MAX
lettering (live text), and the dropdown pieces (deferred).

To start before final art arrives, cut #2, #3, #4 and #6 from the current sheet as stopgaps. Their rects
change when the final art lands, and nothing else does.

## Approach

Each step leaves the workspace typechecking with its tests passing.

### Step 0: Linear

One story in **Word Poker Native** (team Story Time), with the steps below as its checklist and the two
images attached.

### Step 1: Art geometry, `betting/console-art.ts`

The `banner.ts` / `community-strip.tsx` pattern. Use relative `require`s (Jest maps `@/` to `src/` only)
and record each picture's pixel size. On the console, record where the live pieces sit in console pixels:
`POWER_SLOT`, `SLIDER` (track + MIN/MAX/bubble band), `BUTTON_ROW`, and `MUG` (centre and diameter; it may
overhang the right edge). Then add one helper, `consoleLayout(width)`, that returns `scale` and every rect
in points. A pure function, so one small test pins the rects at a 393 pt width.

### Step 2: `betting/console-button.tsx`

A `Pressable` over one `expo-image` face (`red | dark | gold`, at the art's aspect, width from the row),
with an optional `amount` above a `label`, both in `fonts.arcade` with a dark `textShadow`. Pressing sinks
the face 2 pt under a darkening overlay. It takes the same `disabled`, `testID` (+ `webTestID`) and
`accessibilityLabel` contract as `GameButton`, so the row's ids and labels carry over unchanged.

### Step 3: Reskin `raise-slider.tsx`

- Remove the `RAISE`/`BET` caption and the trailing number (the gold button and the bubble now say both).
- Above the track: `MIN $40` on the left and `MAX $1,020` on the right (exact `toLocaleString`), plus the
  **bubble** following the thumb (`left: progress%`), clamped so it never leaves the console. It prints
  the exact amount.
- Track (#3), clipped fill (#4), and thumb (#5) at `left: progress%`. The touch area stays the tall
  responder view, so `locationX` math is untouched.
- Keep `CoachTarget id="raise"`, `accessibilityLabel="Raise amount"`, the `adjustable` actions, and the
  disabled behaviour.

### Step 4: Reassemble `betting-controls.tsx` inside the console

- The console picture (#1) at the row's width. Children are absolutely placed from `consoleLayout`.
- Left: `slot-square` (#2) holding `leading` (the power chip at slot height), only when `leading` is set.
- Centre: `RaiseSlider`, then the `ConsoleButton` row: FOLD `action-fold` · ALL IN `all-in-button` (opens
  the existing `AllInSheet`) · BET/RAISE `action-wager` with `formatCompactAmount(amount)`.
- Right: the mug (#7) as a `Pressable` (`action-check-call`). It prints CHECK, or CALL over
  `formatCompactAmount(callAmount)`. The confirm keeps "CHECK", as today.
- Coach targets keep their ids. `actions` now wraps the whole console, and `check` and `wager` wrap their
  controls. Check that the tutorial's lessons still frame correctly.
- `useCompactControls` / `useScreenScale` now come down to the console's width; the per-button `scale`
  and `compact` props go.

### Step 5: Fit it into `game-screen.tsx`

- The console is taller than today's row (~150 pt vs ~100 pt at 393 pt wide), so the felt gives up the
  difference. Check `tableRegion`'s `minHeight` (272 / 234 compact) on a 360 × 640 window. If it doesn't
  fit, cap the console at the window's height budget rather than shrinking the felt below its minimum.
- Let the console's wood run into `insets.bottom` (a matching fill under it), so there's no felt strip
  under the home indicator.
- The `waiting` state draws its controls in the same console footprint, so the bar doesn't jump in height
  at the deal.
- `ActionBarShade` sits under an opaque console. Delete it if nothing else shows through.

### Step 6: Tests and checks

- Update `game-screen.test.tsx`, `offline-game-screen.test.tsx`, and `tutorial-screen.test.tsx` where they
  read the old structure. Ids, labels and the `Raise amount` slider stay, so most queries hold.
- One small `console-art.test.ts` for `consoleLayout`.

## Critical files and anchors

- `apps/mobile/src/components/screens/game/betting/betting-controls.tsx`, `raise-slider.tsx`,
  `use-raise-amount.ts` (unchanged), `format-amount.ts` (unchanged), `all-in-sheet.tsx` (unchanged).
- `apps/mobile/src/components/screens/game/primitives/community-strip.tsx` and
  `src/components/hud/top-bar/banner.ts`: the picture-pixel-rect pattern to copy.
- `apps/mobile/src/components/chip/chip-sprite.tsx`: `expo-image` usage.
- `apps/mobile/src/components/screens/game/game-screen.tsx`: where the row sits; `waiting`; `ActionBarShade`.
- `apps/mobile/src/components/powers/power-use.tsx`: `PowerHeldChip`, the `leading` content.
- `.maestro/offline-hand.yaml`, `four-seat/_all-in.yaml`, `four-seat/_confirm.yaml`: selectors that must
  keep working (`action-wager` contains `$20`; `action-check-call` contains `$320`).

## Verification

1. `pnpm typecheck && pnpm --filter @wordpoker/mobile test && pnpm --filter @wordpoker/mobile lint`.
2. Web (`pnpm --filter @wordpoker/mobile web`), offline table, at 393 × 852, at 360 × 640, and at a
   desktop window (scale 1.6). Compare against the mockup:
   - the slider drags, the bubble tracks the thumb, and MIN/MAX are right;
   - FOLD, ALL IN (opens the sheet) and RAISE fire;
   - the mug reads CHECK, then CALL $N facing a bet;
   - locked controls dim off-turn.
3. A Wild table shows the power chip in the slot. A Classic table shows no slot.
4. The tutorial: coach highlights land on the slider, the mug and the raise button.
5. `.maestro/offline-hand.yaml` and the four-seat all-in/confirm flows pass unchanged.

## Assumptions and contingencies

- **The mockup's CALL + CHECK pair** is read as the mug being check/call and the dark slot being ALL IN
  (see Decisions). If the design intends CALL in the row, ALL IN needs another home: MAX's label as a
  tap target, or the deferred presets dropdown.
- **The mockup's mismatched figures** ($40 on RAISE, $120 in the bubble) are taken as placeholders: both
  show the slider's amount.
- If the final console art can't drop its baked slots, Step 1 measures the baked square and circle and
  Step 4 puts the content in them. A Classic table then shows an empty square.
