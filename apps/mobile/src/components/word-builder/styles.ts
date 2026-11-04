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

import { HOLDER } from "./rack-holder-box";

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
  // The draft's line above the tray, on the wood: one line, centred, as tall when empty. The
  // rack's frame rises `HOLDER.top` above the tiles, so the line keeps clear of it.
  previewSlot: {
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: HOLDER.top,
  },
  // The word as a plate: fixed height in every state, so a refused word does not move the felt.
  plate: {
    alignItems: "center",
    maxWidth: "100%",
    borderRadius: radius.md,
    columnGap: spacing.md,
    flexDirection: "row",
    justifyContent: "center",
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
  validWord: {
    ...type.label,
    color: colors.successHi,
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
  // Portrait has the width for shuffle and check side by side.
  trayActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.xs,
    justifyContent: "center",
    marginTop: spacing.xxs,
  },
  // The plate stretches the slot, which is the rail's length; a gap keeps it off the rail's top.
  previewSlotLandscape: {
    alignItems: "stretch",
    alignSelf: "center",
    height: 24,
    marginBottom: 8,
    minHeight: 0,
    overflow: "visible",
  },
  // The controls at the left edge, then the strip centred in the rest.
  trayLandscape: {
    alignItems: "center",
    flexDirection: "column",
    justifyContent: "center",
    alignSelf: "stretch",
    marginHorizontal: 0,
  },
  // Shuffle and check, one row with the tiles: level with them, under the draft's line, and
  // pinned to the row's left edge so the rail stays centred on the screen.
  trayActionsLandscape: {
    alignItems: "center",
    flexDirection: "column",
    gap: 6,
    left: 0,
    marginTop: 46,
    position: "absolute",
  },
  // A pocket cut into the rail, the size of a tile; a dealt tile sits over its pocket.
  emptyPlace: {
    backgroundColor: "rgba(40,16,2,0.35)",
    borderColor: "rgba(30,12,0,0.45)",
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
  // The blank's letter bar, pinned on top of the native keyboard (STO-1031): the ✕, the word as
  // it will read with the blank in it, and what it scores. The board stays put behind a scrim.
  blankScrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(6,10,24,0.35)" },
  blankSticky: { bottom: 0, left: 0, position: "absolute", right: 0 },
  blankBar: {
    alignItems: "center",
    backgroundColor: "#0f1736",
    borderTopColor: "#e0974a",
    borderTopWidth: 2,
    columnGap: spacing.md,
    flexDirection: "row",
    minHeight: 58,
    paddingVertical: spacing.xs,
  },
  blankClose: {
    alignItems: "center",
    backgroundColor: "#7a3a1a",
    borderColor: "#e0974a",
    borderRadius: 18,
    borderWidth: 3,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  blankCloseText: { color: "#f7e7b5", fontFamily: fonts.arcade, fontSize: 13 },
  blankMiddle: { alignItems: "center", flex: 1, rowGap: 4 },
  blankCaption: {
    color: "#9aa6cf",
    fontFamily: fonts.rubikSemiBold,
    fontSize: 8.5,
    letterSpacing: 1,
  },
  blankWord: { alignItems: "center", columnGap: spacing.sm, flexDirection: "row" },
  blankTiles: { columnGap: 4, flexDirection: "row" },
  blankTile: {
    alignItems: "center",
    backgroundColor: "#f0dbb2",
    borderRadius: 5,
    height: 28,
    justifyContent: "center",
    width: 24,
  },
  // The blank itself: dashed while it has no letter, the seat's dark tile once it does.
  blankTileOpen: {
    backgroundColor: "rgba(8,12,28,0.7)",
    borderColor: "#f2c75a",
    borderStyle: "dashed",
    borderWidth: 2,
  },
  blankTileNamed: { backgroundColor: "#1c1917", borderColor: "#f2c75a", borderWidth: 2 },
  blankTileText: { color: "#2b1c10", fontFamily: fonts.arcade, fontSize: 16 },
  blankTileTextOpen: { color: "#f7d77a" },
  blankScore: { color: "#f7d77a", fontFamily: fonts.arcade, fontSize: 14 },
  // Balances the ✕ so the word sits in the bar's middle.
  blankSpacer: { width: 36 },
  // Focused but out of sight: it only summons the keyboard and reads its keys.
  blankInput: { height: 1, opacity: 0, position: "absolute", width: 1 },
  chipFace: {
    color: "#d9c9ff",
    fontFamily: fonts.arcade,
    fontSize: fontSize.small,
  },
  chipFaceChosen: { color: "#ffffff" },
});
