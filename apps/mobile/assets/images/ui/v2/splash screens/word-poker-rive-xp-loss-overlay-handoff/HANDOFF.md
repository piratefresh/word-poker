# Codex Handoff — Word Poker XP Gain Overlay (after loss / end of hand)

## Goal

Implement a lightweight overlay that appears after a player loses a hand (or any non-winning result) and still rewards account/progression XP.

This is **not** a loser splash screen. It is a short progression moment:
- show placement
- show XP gained
- show the XP bar fill from current XP to new XP

Do **not** show the player avatar in this version.

Use the supplied PNG layers to build this in Rive and wire it into the React Native game UI.

---

## Package contents

```
word-poker-rive-xp-loss-overlay/
├─ HANDOFF.md
├─ asset-manifest.json
├─ reference/
│  └─ xp-loss-overlay-reference.png
└─ assets/
   ├─ 01-xp-bar-shell.png
   ├─ 02-xp-fill-strip.png
   ├─ 03-star-medallion.png
   ├─ 04-xp-popup-pill.png
   ├─ 05-sunburst-bg.png
   ├─ 06-sparkle-burst-fx.png
   ├─ 07-soft-gold-glow.png
   ├─ 08-bar-outer-glow.png
   └─ 09-placement-pill-blank.png
```

The reference image is just a storyboard / layout cue, not final art to embed directly.

---

## Target repo

Windows repo:
`E:\WebStuff\word-poker`

Suggested destination:
- PNG assets: `apps/mobile/assets/images/ui/v2/results/xp-overlay/`
- Rive file: `apps/mobile/assets/rive/xp-gain-overlay.riv`

A Rive MCP is available in the Codex session. Use it where helpful to inspect / author the `.riv` file instead of manually guessing structure.

---

## Product intent

This overlay should appear after a player does **not** win the hand, so the hand still ends with a small positive progression moment.

It should feel quick and satisfying, not like a separate page transition.

The game table should remain visible behind the overlay.

This is an overlay, not a route change.

---

## Layout

Keep the composition simple and centered near the lower-middle of the table.

Suggested vertical stack:

1. **Placement label**
   - e.g. `4TH PLACE`
   - smaller pill above the popup or above the bar

2. **XP amount popup**
   - e.g. `+24 XP`
   - appears slightly above the bar

3. **XP bar**
   - star medallion on the left
   - numeric text on the right side of the bar
   - bar animates from current XP to new XP

Example dynamic values:
- placement: `4TH PLACE`
- xpGain: `+24 XP`
- xpBefore / xpAfter: `128 / 200` -> `152 / 200`

---

## Desired animation

### Sequence

1. **Placement appears**
   - placement pill fades/slides in first
   - small scale pop only

2. **XP amount pops in**
   - `+24 XP` plaque appears above the bar
   - quick scale overshoot
   - sparkle burst can appear behind it

3. **Bar fill animates**
   - fill grows from current percentage to target percentage
   - numeric label updates from `128 / 200` to `152 / 200`
   - optional glow sweeps across the bar once
   - if the fill crosses a level boundary later, that can be a separate follow-up task

4. **Hold**
   - remain readable for ~0.8–1.2s
   - then let the existing hand flow continue

### Timing target
Total animation length: ~1.6–2.2 seconds

### Reduce Motion
If reduce motion is enabled:
- show final placement text
- show `+XP` amount
- show XP bar already in final filled state
- minimal opacity fade only
- no burst / overshoot / scale bounce

---

## Rive file structure

Create:
`xp-gain-overlay.riv`

Suggested artboard:
`XpGainOverlay`

Suggested state machine:
`XpGain`

Suggested hierarchy:

```
XpGainOverlay
├─ Background
│  ├─ SunburstBg
│  └─ SoftGlow
├─ Placement
│  ├─ PlacementPill
│  └─ PlacementText
├─ XpPopup
│  ├─ PopupPill
│  ├─ XpGainText
│  └─ SparkleBurst
├─ XpBar
│  ├─ BarOuterGlow
│  ├─ BarShell
│  ├─ FillMask
│  │  └─ FillStrip
│  ├─ StarMedallion
│  └─ ProgressText
└─ Fx
```

Use a mask/clip for the fill strip so width can be animated cleanly.

---

## Runtime data model

Use Rive data binding / text inputs if supported by the installed runtime. Otherwise use the project's existing Rive integration pattern.

Suggested logical model:

```ts
type XpGainOverlayData = {
  placementLabel: string;   // "4TH PLACE"
  xpGain: number;           // 24
  currentXp: number;        // 128
  newXp: number;            // 152
  xpCap: number;            // 200
  reduceMotion: boolean;
};
```

Derived strings:
- `xpGainText = "+24 XP"`
- `progressTextBefore = "128 / 200"`
- `progressTextAfter = "152 / 200"`

Derived normalized fill:
- `fillStart = currentXp / xpCap`
- `fillEnd = newXp / xpCap`

---

## React Native integration

Do not rebuild the table in Rive.

Create a focused overlay component similar to:

`apps/mobile/src/components/game/results/xp-gain-overlay.tsx`

Responsibilities:
- receive already-resolved result / progression data
- mount absolute-fill over the game table
- render the Rive overlay
- not own gameplay authority
- unmount cleanly after animation completes or timeout fallback

Pseudo shape:

```tsx
<View style={StyleSheet.absoluteFill} pointerEvents="none">
  <RiveXpGainOverlay ... />
</View>
```

The overlay should be able to run after a hand result without blocking future hand setup longer than necessary.

---

## Dynamic text and values

Do **not** bake any of this into the art:
- placement text
- `+XP` amount
- progress values

These should be runtime text fields.

---

## Acceptance criteria

- Overlay appears over the existing table after a non-winning result.
- No avatar is shown.
- Placement is clearly displayed.
- XP amount is clearly displayed.
- XP bar visibly fills from current XP to new XP.
- Current and final XP values are readable.
- Table remains visible in the background.
- No full page/navigation transition.
- Works in portrait phone layout.
- Reduce Motion shows a clean final state without animation.
- No gameplay logic is moved into Rive.
- Relevant lint/typecheck/tests still pass.

---

## Nice-to-have (not required for first pass)

- subtle glow sweep over the filled portion
- tiny star twinkle when the fill completes
- event callback like `xpOverlayComplete`
- future support for level-up carry-over animation if `newXp > xpCap`

Do not expand scope into full level-up flow yet.
