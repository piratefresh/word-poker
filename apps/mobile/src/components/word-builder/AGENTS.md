# Word builder

Loaded when working in this folder. Repo-wide rules are in the root `AGENTS.md`.

## Drag-and-drop exception: the sortable strip

**One documented exception: the word builder's sortable strip** (`word-builder/strip.tsx`). The kit's
horizontal `Sortable` is the only thing that animates the other tiles out of a dragged tile's way, but it
arms its drag with a 200ms long-press that is not configurable — on the web, with a pointer, a tile reads as
one that will not move. So the strip drives its own pan (Reanimated + gesture-handler, the same ground the kit
sits on): it arms on `DRAG_ACTIVATE_PX` of travel, like dnd-kit's pointer sensor, and slides the rest of the
tiles aside as the dragged one crosses their places. This is the *only* place a pan is hand-rolled; everything
else still goes through the library. Do not spread this pattern — if a second surface needs it, lift it into a
shared hook first.

## The builder


`apps/mobile/src/components/word-builder/` is the one builder for every mode: `WordHand` is the
sortable strip of tiles and goes in the felt's rack slot (`GameScreen`'s `rack` prop), and
The draft is one line of text in the tray header beside the label — it draws nothing until the
strip spells something. The builder carries no buttons of its own: the shuffle is
`WordShuffleButton`, placed with `WordCheckButton` in a row under the rack (`GameScreen`'s
`rackActions` prop), so the word's controls sit with its tiles and the betting rows keep their
width; §19's window replaces betting controls with **SUBMIT WORD**, a labeled shared deadline,
and a reminder that submission locks the word. **Word Checker** checks validity without
submitting. Pending submission is distinct from authoritative acceptance. `WordBuilder` owns the draft the
two share; a mode's adapter hands it a `WordDraft` — plays, word, score, reason, confirmed,
`open`, `confirmable` — and gets the seat's edits back as one `onDraft(plays)` call
(`apps/mobile/src/features/offline/use-offline-game.ts` is the offline adapter). Never write a second builder:
the engine judges the draft, the builder only draws it and reports it.

The word is built the whole hand, in parallel with the betting, not only at the river: `open` is
true while the seat may still play and sort tiles, and `confirmable` is the narrower gate that
§19's word window opens for locking the word in. The offline adapter holds the seat's draft
locally across every street and judges it against `game-rules` for the live preview, then hands
the confirmed submission to the engine.

The tiles are sorted where they lie: a tap toggles a tile in or out of the word *without moving
it*, a drag reorders it through the strip, and the word is the selected tiles read left to right —
the word's order *is* the strip's order, and there is no second row of played tiles. Shuffle
rearranges only the tiles the word does not hold. The seat's order is the one source of truth: the
strip re-seeds its layout from that order (see `strip.tsx`), so an external edit — a tap, a fresh
tile dealt — is never fought by a private copy of the list. A tile ignores a press for
`DRAG_SETTLE_MS` after a drop, because the pan does not cancel the tile's own press on the web —
the pointer never leaves the tile, since the tile travels with it.

A choice tile (§10) stops printing its pair the moment the word plays it: the tile shows the one
face it plays — that letter, at a single letter's size, with that face's own value — and the two
chips under it keep naming both faces, so the seat can switch to the other one. Nothing chosen yet
draws the pair as it always did, and the tile read aloud still gives both faces and the one played
(§39).

The rack is a straight row of `TILE_METRICS`'s `medium` tile, grown by the window's `screenScale`
(`screens/game/screen-scale.ts`; exactly 1 below a 600-point shorter side, then growing with it up to
a cap, `rackFor` in `strip.tsx`) — the one factor the banner, HUD buttons, community tiles and action
row grow by too, with the play column bounded by `stageMaxWidth` — and the places spread into the room
the felt gives them — up to a tile and `MAX_GAP` — closing in on each other (the gap first, then
some of the tile) when that room is narrower than the row, so a hand of seven stays on screen and
stays tappable. The strip's places and its drag are measured in that tile, so the two cannot
drift apart.

