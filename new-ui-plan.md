# Wooden tabletop redesign with 2.5D tiles

## Summary

Implement the reference’s warm wooden table, chunky cream tiles, framed seats, and colorful controls across offline, online, and tutorial play on iOS, Android, and web.

Use anonymous seat initials and retain the current word-building interaction. You’ll supply the artwork listed below.

**2.5D is practical with the current stack:** visible thickness, bevels, highlights, shadows, and animated flips are plain views and Reanimated. True 3D would require a separate renderer and lighting integration; it is outside this first phase.

## Implementation changes

- **Portrait layout:** Update the existing `GameScreen`. Top to bottom: HUD → opponents in an arc across the top → community tiles → pot → local seat → builder → betting panel. Seat positions come from explicit `layoutConfig.seatAngles` in a tabletop entry of `tableSeating` (hero at the bottom, opponents spread over the top arc), not from the evenly spaced ring, whose side seats would land on the community row. At 5–9 seats the same top arc holds, and seats switch to the existing beside-labels layout (`seatDirection`'s more-than-four branch) to stay narrow.
- **Landscape layout:** Its own branch in `GameScreen` (`width > height`), matching the desktop reference: a full-width top band (HUD, opponents, community) over a three-column bottom band — builder with Shuffle/Check on the left, pot and local seat in the centre, raise panel and Fold/Call/Raise on the right.
- **Small phones:** The portrait stack must fit 375 × 667. Nothing adds a row: All In sits in the RAISE TO row beside the amount box, the Wild power joins the Shuffle/Check row, and opponent racks shrink under the existing `compact` threshold.
- **Background:** Add `tabletop` as another `SCENES` entry in `scene-backdrop.tsx` (it already switches portrait/landscape art). Replace the four hard-coded `"tavern" || "planet"` checks (`game-screen.tsx`, `mesh-backdrop.tsx`, `table-backdrop.web.tsx`, `table-image.tsx`) with one `isRoomBackdrop()` in `backdrop-style.ts`, so the oval table painting hides and room placement applies for tabletop too. Make it the default last, once the layout lands. Consider replacing the `wood` tiled look with it rather than adding an eighth.
- **Seats and pot:** Colored initials circles, dark nameplates, a coin icon with the stack (no `$`), and status badges. Opponent racks show two tile backs, drawn by `PlayerSeat` itself from a `dealt` boolean (`!waiting`): hidden for the hero, for folded or busted seats, and before the deal. Retain dealer/blind markers, action status, side pots, and chip flights.
- **Community row:** Render it inside the table's existing `hud` overlay, positioned with `useTableLayout()` at the layout's community anchor — no new `PokerTable` prop, and it stays one view so the tutorial's `community` target still has a box. Not-yet-dealt slots are `Tile side="back"`, so the turn and river use the existing flip to reveal.
- **Tiles:** Restyle the canonical `Tile`: smooth ivory face, darker lower edge, rounded bevels, red diamond-patterned backs, fixed warm lighting from the upper left. The smooth face is the existing `gradients.tile` fallback in `FaceFill`, retinted, with one static darker view under the face for thickness. Drop the per-tile pixel-art texture (`tile-texture/`) — it is the opposite look and identical faces need no per-id cache. Keep letters, points, choice faces, and badges as live UI.
- **Shadows:** The contact shadow is a sibling view with `boxShadow` under each tile, its scale and opacity animated from the tile's existing lift values, so it widens and fades as the tile rises. No Skia canvases: on the web every canvas is its own WebGL context (see `game-button.tsx`).
- **Builder:** Draw a cream tray around the existing sortable strip with seven places — two private and five community. Places for community tiles not yet dealt are dashed; the strip fills the rest. Taps select letters, dragging changes order, and the draft remains above the tray. Keep the documented drag implementation and choice-letter controls.
- **Betting:** Red Fold, blue Check/Call, and gold Bet/Raise inside a cream panel. No −/+ steppers on either layout: the slider and amount box are the only raise input. Restyle Shuffle (dark) and Check Word (green); the button already prints the remaining quota, so it only needs the `CHECK WORD n/5` label.
- **Typography:** Reuse the installed Lilita One (`fonts.arcade`) for prominent labels and Inter for supporting text. Use ivory, honey-colored wood, dark brown, bright red, blue, and green from the reference.

**Interface changes:** Add `tabletop` to `BackdropStyle`, `isRoomBackdrop()` to `backdrop-style.ts`, blue/green materials to `GameButtonVariant`, and a `dealt` boolean to `PlayerSeat`. Existing defaults remain compatible. Game rules and network contracts need no changes.

## Artwork needed from you

| Asset | Export specification |
|---|---|
| `tabletop-portrait.webp` | **1440 × 2560** WebP (or JPEG), wooden desk with edge decorations such as the plant, coffee, and notebook. No gameplay UI. |
| `tabletop-landscape.webp` | **2560 × 1440** WebP (or JPEG), matching materials and lighting, recomposed for landscape. |
| `phase-frame-left.png`, `phase-frame-middle.png`, `phase-frame-right.png` | Transparent PNGs, **384 px tall**. The wooden capsule cut into a left cap, a stretchable middle strip, and a right cap, so it widens for “PREFLOP \| 0:28” and the waiting label. No text, timer, or icons. |
| `opponent-rack.png` | Transparent PNG, approximately **1024 × 512**. Blank wooden two-tile rack/plinth; no tiles, names, or amounts. |

The current scene backgrounds are 941 × 1672 PNGs at about 1.7 MB each; backgrounds have no transparency, so WebP keeps the bundle and web export small. Check the 1440 size against the tavern art on a tablet before final export. Keep the middle of each background clear enough for readable gameplay, keep decorations clear of the top-corner HUD buttons, use the same warm upper-left lighting across all exports, and leave room for cropping on different screen ratios.

**No avatar illustrations, individual letter images, button sprites, or 3D models are needed.** Cream panels, tile surfaces, initials, icons, and controls will be drawn in code. Existing chip artwork can be reused.

## Implementation order and validation

Tracked as epic [STO-526](https://linear.app/magnus-adhd-brain/issue/STO-526) with one sub-issue per branch (STO-527 – STO-537, label `UI`).

1. Materials on their own branches: tiles, buttons, tabletop backdrop with placeholder art, builder tray.
2. Seats, portrait layout, betting panel, and HUD capsule, then the landscape layout on top of them.
3. Integrate the artwork as it arrives.
4. Make tabletop the default and refresh screenshot and Maestro baselines.
5. Run typecheck, mobile lint/tests, boundary checks, and native export checks.
6. Verify offline, online Classic/Wild, and tutorial flows, including waiting, choice tiles, depleted word checks, all-in confirmation, side pots, and payout.
7. Review screenshots on small phones (375 × 667), standard portrait phones, landscape, tablet, and desktop. Confirm readable labels, reachable controls, unclipped shadows, correct tutorial targets, and reduced-motion behavior.

## Defaults and acceptance criteria

- Anonymous seat initials remain the identity policy.
- Gameplay, word-check limits, and betting legality continue to come from existing state and shared rules.
- Supported seat counts (2–9) remain available; this redesign does not increase table capacity.
- Preserve existing test IDs and accessible controls.
- First-phase lighting is fixed; background decorations are static.
- Completion requires a recognizable match to the reference, working interactions across all three modes, and visual verification on iOS, Android, and web.
