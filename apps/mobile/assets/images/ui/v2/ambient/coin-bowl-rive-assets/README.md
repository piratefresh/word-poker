# Coin bowl Rive spike

Editor: https://editor.rive.app/file/untitled/2635028

Runtime export: `E:\WebStuff\word-poker\apps\mobile\assets\images\ui\v2\ambient\coin-bowl-rive-assets\coin-bowl.riv`

Created through the Rive MCP on 2026-10-06. Artboard `CoinBowl` is
1024 × 1024 with a transparent background and five embedded PNGs. Draw order
from back to front: Shadow, LooseBack, Bowl, CoinPile, LooseFront.

The coin pile sits inside the bowl opening at (512, 412), with 101.1386%
horizontal and 75.8540% vertical scale, preserving the user's enlarged
composition. Idle and both shakes key the same scale and resting position.
Pile translation and rotation were reduced by 20% after enlargement.

## Clipping

`BowlOpeningMask` is a 700 × 280 ellipse centered at (512, 394),
inside the ceramic rim. Its transparent fill keeps it from covering the
artwork. Its parent `BowlMaskAnchor` shares the bowl's position and rotation
keys in Idle, SmallShake, and BigShake, so the clipping boundary follows
the ceramic object rather than the delayed coin motion.

The user attached clipping in the Rive editor. CoinPile's ClippingShape
references BowlMaskAnchor, which contains the opening ellipse. The clip
is included in the current export; the loose coins remain outside it.

Timelines: `Idle` (static neutral pose), `SmallShake` (380 ms), and
`BigShake` (560 ms), all one-shot. Both shakes settle to neutral. The bowl
moves only a few pixels; the shadow moves less than half a pixel. BigShake
adds a 3 px lift to the front coin layer and delays the pile's rebounds.

## State machine and integration

The editor tools report `CoinBowlControls` and guarded transitions, but
runtime exports omit the model. Do not enable automatic data binding
against this export.

Web plays the authored SmallShake / BigShake timelines directly. Native
renders the idle state with data binding disabled and animates the bowl
container (380 / 560 ms). A confirmed raise uses the small shake; a confirmed
all-in uses the big shake, for any seat. Reduced motion suppresses both.
Optimistic wager renders do not advance the confirmed-turn baseline.
The host `scene-backdrop.tsx` positions the bowl partly off the left edge
and adds cast/contact shadows beneath it. Static PNG layers cover runtime
loading and failure.

The Rive workspace plan refused `.rev` backup export. The cloud editor
file remains the editable source; runtime `.riv` export succeeded.
