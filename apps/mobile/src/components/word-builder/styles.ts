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

/** The word plate's height, and the strike line's colour when the word will not count. */

const REFUSED_STRIKE = "#ffb4a0";

/**
 * The builder's sheet, in one place because the draft line, the strip, and the shuffle are one
 * surface: a tile means the same thing wherever it is drawn, and a change to what a tile's
 * place in the strip is belongs to every place at once. Only the entries that are genuinely
 * local to a component are named after one.
 */
export const styles = StyleSheet.create({
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
  // The draft's line above the tray, on the wood: one line, centred, as tall when empty.
  previewSlot: {
    alignItems: "center",
    justifyContent: "flex-end",
  },
  // The word as a plate: fixed height in every state, so a refused word does not move the felt.
  plate: {
    alignItems: "center",
    maxWidth: "100%",
    borderRadius: radius.md,
    columnGap: spacing.md,
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.4)",

    paddingHorizontal: spacing.xs,
  },
  plateTiles: {
    alignItems: "center",
    columnGap: spacing.xs,
    flexDirection: "row",
    flexShrink: 1,
    minWidth: 0,
  },
  plateWord: {
    ...type.numeric,
    color: colors.textBright,
    fontSize: fontSize.title,
    letterSpacing: 3,
  },
  plateStrike: {
    backgroundColor: REFUSED_STRIKE,
    height: 2,
    left: -2,
    position: "absolute",
    right: -2,
    top: "50%",
  },
  plateEquals: {
    ...type.numeric,
    color: colors.textDim,
    fontSize: fontSize.title,
  },
  notAWord: {
    ...type.label,
    color: colors.danger,
    fontSize: fontSize.body,
    marginLeft: spacing.sm,
  },
  plateDim: { opacity: 0.4 },
  coin: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  // The hover card over the coin: each letter's value, the rack bonus, and the total.
  breakdown: {
    backgroundColor: "#1a1410",
    borderRadius: radius.md,
    bottom: 48,
    padding: spacing.md,
    position: "absolute",
    right: 0,
    rowGap: spacing.xs,
    width: 190,
    zIndex: 10,
  },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  breakdownLabel: {
    ...type.numeric,
    color: colors.textBright,
    fontSize: fontSize.small,
  },
  breakdownValue: {
    ...type.numeric,
    color: colors.textBright,
    fontSize: fontSize.small,
  },
  breakdownGold: { color: colors.gold },
  breakdownTotal: {
    borderTopColor: colors.border,
    borderTopWidth: border.hairline,
    paddingTop: spacing.xs,
  },
  coinDim: { backgroundColor: colors.surface },
  coinText: { ...type.numeric, color: colors.onGold, fontSize: fontSize.title },
  coinTag: {
    ...type.label,
    backgroundColor: "#fff",
    borderRadius: radius.pill,
    color: colors.onGold,
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 5,
    position: "absolute",
    right: -6,
    top: -8,
  },
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
  // The hand's place on the felt mat (STO-538): no tray of its own, just the card slots and,
  // under them, the word's controls.
  // Inset past the mat's stitch, with room under the controls for the mat's tilt and the betting
  // row's overlap, so the whole hand lies on the felt.
  tray: {
    alignSelf: "stretch",
    marginHorizontal: 24,
    paddingBottom: 0,
    paddingTop: spacing.xs,
  },
  trayActions: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    marginTop: spacing.xxs,
  },
  previewSlotLandscape: {
    alignItems: "flex-start",
    height: 24,
    minHeight: 0,
    overflow: "visible",
  },
  // A phone on its side: the tiles from the content's edge, then shuffle and check beside them.
  trayLandscape: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexDirection: "row",
    marginHorizontal: 0,
  },
  // Beside the last tile, one row with it: the shuffle and check pills, as portrait draws them.
  // The strip's end inset is the 8 before the disc; 6 between the two (mock 3a: ends at 432).
  trayActionsLandscape: {
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginLeft: 0,
    marginTop: 0,
  },
  // A card slot stitched into the felt, the size of a tile; a dealt tile sits over its slot.
  emptyPlace: {
    backgroundColor: "rgba(0,24,10,0.22)",
    borderColor: "rgba(214,236,214,0.4)",
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
  entry: { alignItems: "center" },
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
  faces: {
    backgroundColor: "rgba(20,12,40,0.55)",
    borderColor: "#8a5fd0",
    borderRadius: 12,
    borderWidth: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  faceCaption: {
    color: "#f2c75a",
    fontFamily: fonts.rubikSemiBold,
    fontSize: 8,
    letterSpacing: 1.1,
    lineHeight: 9,
    marginTop: 2,
    textAlign: "center",
    textTransform: "uppercase",
  },
  chip: {
    alignItems: "center",
    justifyContent: "center",
    height: 32,
    width: 26,
  },
  // The letter the word plays the tile as.
  chipChosen: { backgroundColor: "#8a5fd0" },
  chipSpent: { opacity: opacity.disabled },
  // The blank's A–Z row, wrapped above the tray.
  blankPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
    paddingBottom: spacing.xs,
  },
  chipFace: {
    color: "#d9c9ff",
    fontFamily: fonts.arcade,
    fontSize: fontSize.small,
  },
  chipFaceChosen: { color: "#ffffff" },
});
