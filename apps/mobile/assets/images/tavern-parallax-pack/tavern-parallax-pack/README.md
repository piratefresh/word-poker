# Tavern Parallax Asset Pack

Canvas: 1672 x 941 (16:9)

Stack back-to-front:

1. `00_bg_far.png` — clean, opaque far-room/base plate
2. `01_bg_architecture.png` — beams, arches, windows, structural framing
3. `02_bg_decor.png` — shelves, bottles, signs and wall-side decoration
4. `03_bg_near_furniture.png` — chairs, stools, counters and near-room furniture
5. `04_table_foreground.png` — poker table, beer mug, coins and book props
6. `05_fx_glow_dust.png` — warm rays, particles and atmospheric glow
7. `06_fx_vignette.png` — edge darkening / warm framing overlay
8. `07_foreground_props.png` — optional closest props for strongest depth

## Suggested motion

Keep the poker table/gameplay plane nearly fixed. Move the room behind it from least to most as depth approaches camera:

- Far: 1-2 px
- Architecture: 3-4 px
- Decor: 4-6 px
- Near furniture: 7-10 px
- Table: 0-1 px
- Foreground props: 10-14 px

For vertical movement, use roughly half the horizontal amount.

## Alive effects

- Slowly pulse/flicker `05_fx_glow_dust.png` opacity around 0.75-1.0.
- Add a tiny vertical drift to the FX layer, around 1-3 px over several seconds.
- Let `07_foreground_props.png` react most strongly to pointer/gyro movement.
- Keep `06_fx_vignette.png` screen-locked rather than parallaxing.
- Keep gameplay UI above all environment layers.

## Implementation note

All assets share the same canvas size so they can be positioned from the same origin. Do a final composite/alignment pass in-engine before locking motion values, since AI-generated transparent layers can need small mask or edge cleanup where silhouettes overlap.
