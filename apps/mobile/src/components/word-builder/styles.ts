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
  previewRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexShrink: 1,
    flexWrap: "nowrap",
    columnGap: spacing.sm,
  },
  // A step lower: the rack rides closer to the action row.
  stripTight: { top: 6 },
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
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
    minHeight: 32,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkedResultValid: { borderColor: colors.successHi },
  checkedResultInvalid: { borderColor: colors.danger },
  checkedIcon: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.bodyLg,
  },
  checkedLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
  },
  checkedValid: { color: colors.successHi },
  checkedInvalid: { color: colors.danger },
  checkedPoints: {
    ...type.numeric,
    color: colors.successHi,
    fontSize: fontSize.body,
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
  // The draft's line above the tray, on the wood: one line, centred, as tall when empty.
  previewSlot: { alignItems: "center", justifyContent: "flex-end", minHeight: 32 },
  word: { ...type.numeric, fontSize: fontSize.title, letterSpacing: 3 },
  score: { ...type.numeric, color: colors.gold, fontSize: fontSize.small },
  // A draft §11 would refuse is worth nothing, so its number is drawn as what it is.
  scoreRefused: { color: colors.textFaint },
  rackBonus: { ...type.label, color: colors.onGold },
  // A pill hung off the tray's top-right corner, half over its edge.
  rackBonusPill: {
    backgroundColor: colors.gold,
    borderColor: "#fff3dc",
    borderRadius: radius.pill,
    borderWidth: 1.5,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    position: "absolute",
    right: 10,
    top: -12,
    zIndex: 2,
  },
  reason: {
    color: colors.warning,
    fontFamily: fonts.sansMedium,
    fontSize: fontSize.small,
    lineHeight: 19,
  },
  // The cream tray the strip sits in (STO-538), built like the buttons: a face standing on a
  // darker lip. Its back edge recedes into the tabletop, with the front edge anchored.
  trayLip: {
    alignSelf: "stretch",
    backgroundColor: "#bc7d39",
    borderRadius: radius.lg,
    marginHorizontal: 12,
    transform: [{ perspective: 500 }, { rotateX: "16deg" }],
    transformOrigin: "center bottom",
  },
  // The strip's row keeps a band under the tiles for a choice tile's face chips, so the face
  // takes no bottom padding of its own: the band is the room.
  trayFace: {
    backgroundColor: "#ffe0b0",
    borderColor: "#fff3dc",
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    marginBottom: 4,
    paddingBottom: spacing.xxs,
    paddingHorizontal: 6,
    paddingTop: spacing.xs,
  },
  // The tray's header: the label at the left, the word's controls at the right, tiles below.
  trayHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  trayActions: { flexDirection: "row", gap: spacing.xs },
  trayLabel: {
    color: "#4a3018",
    fontFamily: fonts.sansBlack,
    fontSize: 14,
    letterSpacing: 0.3,
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  // A place no tile has been dealt to: a dashed outline the size of a tile.
  emptyPlace: {
    backgroundColor: "rgba(150,100,40,0.1)",
    borderColor: "#bf9a68",
    borderStyle: "dashed",
    borderWidth: 1.25,
    position: "absolute",
    top: 0,
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
