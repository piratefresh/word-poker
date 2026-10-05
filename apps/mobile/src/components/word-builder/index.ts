/**
 * The word builder, in the parts it is made of.
 *
 * One draft, drawn twice: `WordHand` is the strip of tiles that goes in the felt's rack slot —
 * the seat's hand, sorted by dragging and tapped to play — with `WordPreview`, the draft as
 * one line of text, above it. `WordBuilder` owns the draft they share. A mode composes
 * them (see `@/components/screens/offline/offline-game-screen`), and a mode's adapter hands the
 * builder a `WordDraft` — the draft its engine holds, in the builder's words — plus the tiles
 * on the table and where to report an edit.
 *
 * The controls are the table's: the shuffle is `WordShuffleButton`, placed in the row the felt
 * draws under the rack, beside the word check, and the confirm is the action row's check while §19's
 * window is open — so the builder itself carries no button row.
 */

export {
  WordBuilder,
  WordCheckButton,
  WordHand,
  WordPreview,
} from "./word-builder";
export type { WordBuilderProps, WordDraft } from "./word-builder";
export type { SwapFlip } from "./strip";
export { WordShuffleButton } from "./shuffle-button";
