import { StyleSheet } from "react-native";

import { border, colors, fonts, fontSize, opacity, radius, spacing, type } from "@/constants/theme";

/**
 * The builder's sheet, in one place because the draft line, the strip, and the shuffle are one
 * surface: a tile means the same thing wherever it is drawn, and a change to what a tile's
 * place in the strip is belongs to every place at once. Only the entries that are genuinely
 * local to a component are named after one.
 */
export const styles = StyleSheet.create({
  // The draft line above the rack: centred over the strip, with the felt behind it, and no
  // sheet of its own — the line is all it is.
  previewRow: {
    alignItems: "center",
    gap: spacing.xxs,
    paddingVertical: spacing.xxs,
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
  // The shuffle, at the felt's action row start: the same height as the action buttons beside
  // it, square, with only the icon drawn — the row reads as one control strip.
  shuffle: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  shuffleSpent: { opacity: opacity.disabled },
  shufflePressed: { opacity: opacity.pressed },
});
