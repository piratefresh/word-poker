import { StyleSheet } from "react-native";

import {
  border,
  colors,
  fonts,
  fontSize,
  opacity,
  radius,
  spacing,
  type,
} from "@/constants/theme";

/**
 * The builder's sheet, in one place because the draft line, the strip, and the shuffle are one
 * surface: a tile means the same thing wherever it is drawn, and a change to what a tile's
 * place in the strip is belongs to every place at once. Only the entries that are genuinely
 * local to a component are named after one.
 */
export const styles = StyleSheet.create({
  // The draft line above the rack: centred over the strip, with the felt behind it, and no
  // sheet of its own — the line is all it is.
  // A fixed slot above the rack that the line floats in, so a first letter never adds height to the
  // column: the table above would otherwise shrink the moment a tile is played.
  previewAnchor: { height: 48, zIndex: 2 },
  // Small screens: room for the word and its points on two lines, taken from the table above.
  previewAnchorTight: { height: 36 },
  // The points sit right under the word rather than a gap below it.
  previewRowTight: { gap: 0, paddingBottom: 0 },
  // Line boxes as tall as the type, so the points sit under the word and not a line below it.
  wordTight: { lineHeight: 22 },
  scoreTight: { lineHeight: 13 },
  // A step lower: the rack rides closer to the action row.
  stripTight: { top: 6 },
  previewRow: {
    alignItems: "center",
    bottom: 0,
    gap: spacing.sm,
    left: 0,
    paddingBottom: spacing.sm,
    position: "absolute",
    right: 0,
  },
  lettersLabel: {
    ...type.label,
    color: colors.textFaint,
    fontSize: fontSize.caption,
    letterSpacing: 1,
  },
  previewLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: spacing.lg,
    rowGap: spacing.sm,
    justifyContent: "center",
    width: "100%",
  },
  previewContent: { alignItems: "center", flexShrink: 1 },
  previewEmpty: { color: colors.textFaint, fontSize: fontSize.small },
  checkedResult: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
  },
  checkedValid: {
    color: colors.success,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.small,
  },
  checkedInvalid: {
    color: colors.danger,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.small,
  },
  checkedPoints: {
    ...type.numeric,
    color: colors.success,
    fontSize: fontSize.small,
  },
  checkNotice: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkNoticePressed: { opacity: opacity.pressed },
  checkNoticeText: {
    color: colors.textBright,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.caption,
  },
  checkLiveRegion: {
    height: 1,
    opacity: 0,
    overflow: "hidden",
    position: "absolute",
    width: 1,
  },
  preview: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  word: { ...type.numeric, fontSize: fontSize.title, letterSpacing: 3 },
  score: { ...type.numeric, color: colors.gold, fontSize: fontSize.small },
  // A draft §11 would refuse is worth nothing, so its number is drawn as what it is.
  scoreRefused: { color: colors.textFaint },
  rackBonus: { ...type.label, color: colors.success },
  reason: {
    color: colors.warning,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.small,
    lineHeight: 19,
  },
  // The rack's slot: the row of places is centred in it, and it is measured (see `TileStrip`)
  // so the places know how much room they have to spread into.
  strip: { alignItems: "center" },
  // The live strip positions each tile itself, so the row is just the box they lay themselves
  // out inside.
  stripContent: { position: "relative" },
  // A tile's place in the strip, drawn by the tile's own metrics: the column is the tile and,
  // under a choice tile, its faces, and it is placed absolutely by its `left` from the top of
  // the row — whether it is being dragged or just sits there.
  place: { alignItems: "center", position: "absolute", top: 0 },
  entry: { alignItems: "center", gap: spacing.xs },
  /** The gold ring round a tile the seat may choose for its power (§44). */
  pickRing: {
    borderColor: colors.goldHi,
    borderRadius: 9,
    borderWidth: 2,
    bottom: -3,
    left: -3,
    position: "absolute",
    right: -3,
    top: -3,
  },
  /** The two faces of a swap's cross-fade, stacked in the one place. */
  swapFace: { left: 0, position: "absolute", top: 0 },
  faces: { flexDirection: "row", gap: spacing.xxs },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    minWidth: 20,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
  },
  // The face a held choice tile is playing: the tile prints both, so the chip says which one
  // §10 took.
  chipChosen: {
    backgroundColor: colors.goldDeep,
    borderColor: colors.gold,
  },
  chipSpent: { opacity: opacity.disabled },
  chipFace: {
    color: colors.textBright,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.caption,
  },
});
