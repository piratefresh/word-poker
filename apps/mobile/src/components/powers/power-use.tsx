import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { POWER_UPS, type PowerUpId, type Tile as TileData } from "@wordpoker/contracts";

import { useCompactControls, useScreenScale } from "@/components/screens/game/screen-scale";
import { GameButton } from "@/components/ui/game-button";
import { styles as wordBuilderStyles } from "@/components/word-builder/styles";
import { colors, fonts, glow, ledger, palette, radius, spacing } from "@/constants/theme";
import type { PowerView } from "@/features/table/power-view";
import { webTestID } from "@/lib/ui/web-id";

import { POWER_CARD_ASPECT, PowerCard, PowerCardMini, powerCardLabel } from "./power-card";
import type { PowerTargeting } from "./use-power-targeting";

/**
 * The power the hero holds this hand, just left of their seat on the felt: the card the Power
 * Draw kept, drawn small.
 *
 * Lit while the table would take the power — the hero's own betting turn, or §19's window before
 * it confirms — and dimmed otherwise; once spent it wears USED until the next deal. A tap starts
 * choosing a tile, and a second tap while choosing is the cancel. Unavailable Spotlight explains
 * its flop/turn window when tapped.
 */
export function PowerHeldChip({
  held,
  active,
  onPress,
}: {
  held: PowerView["held"];
  /** True while the hero is choosing a tile or confirming one: the chip stands raised. */
  active: boolean;
  onPress: () => void;
}) {
  const scale = useScreenScale();
  const compact = useCompactControls();
  const [showHint, setShowHint] = useState(false);
  const explainsSpotlight = held?.id === "spotlight" && !held.used && !held.usable;
  if (!explainsSpotlight && showHint) setShowHint(false);
  if (held === null) return null;

  // As tall as the buttons beside it, and a card's shape at that height.
  const height = compact ? 60 : 66 * scale;
  const width = Math.round(height / POWER_CARD_ASPECT);
  const state = held.used ? "used" : held.usable ? "ready" : "waiting";
  const hint = "Use Spotlight on your betting turn during the flop or turn.";

  return (
    <View>
      {showHint ? (
        <Pressable
          accessibilityLabel={`${hint} Tap to dismiss.`}
          accessibilityRole="button"
          onPress={() => setShowHint(false)}
          style={styles.unavailableHint}
          testID="power-unavailable-hint"
        >
          <Text style={styles.hint}>{hint}</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityHint={
          explainsSpotlight ? "Explains when Spotlight can be used" : state === "ready"
            ? (active ? "Cancels using it" : held.id === "spotlight" ? "Choose a table tile" : "Choose one of your tiles to swap") : undefined
        }
        accessibilityLabel={`${powerCardLabel(held.id)}${held.used ? " Used." : explainsSpotlight ? " Unavailable." : ""}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: state !== "ready" && !explainsSpotlight, expanded: explainsSpotlight ? showHint : active }}
        disabled={state !== "ready" && !explainsSpotlight}
        id={webTestID("power-held")}
        onPress={explainsSpotlight ? () => {
          setShowHint((shown) => !shown);
          AccessibilityInfo.announceForAccessibility(hint);
        } : onPress}
        style={[
          styles.chip,
          { height, width },
          state === "ready" && styles.chipReady,
          state !== "ready" && styles.chipIdle,
          active && styles.chipActive,
        ]}
        testID="power-held"
      >
        <PowerCardMini id={held.id} width={width} />
        {held.used ? (
          <View pointerEvents="none" style={styles.usedBand}>
            <Text style={styles.usedText}>USED</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** The confirm sheet's power card: wide enough that its rule reads at a glance. */
const CONFIRM_CARD_WIDTH = 150;

/**
 * The felt's side of using a power: while the hero chooses, the felt stays clear and a felt-green
 * bar above the rack says what to do; once a tile is chosen, a felt-green sheet asks to confirm the
 * swap in the catalog's words — "Discard A for a random letter?" — with a caption spelling out the
 * trade. Tapping the dimmed felt, CANCEL, or the bar's ✕ backs out.
 *
 * Drawn in `GameScreen`'s `overFelt`, so the rack below stays in reach: the tiles are what the
 * hero is choosing from.
 */
export function PowerUsePrompt({
  power,
  targeting,
  onCancel,
  onConfirm,
}: {
  power: PowerUpId | null;
  targeting: PowerTargeting;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const spotlight = power !== null && POWER_UPS[power].family === "spotlight";
  const question =
    power !== null && targeting.stage === "confirming"
      ? spotlight
        ? `Spotlight the ${tileLetters(targeting.tile)}? It scores double for everyone.`
        : `Discard ${tileLetters(targeting.tile)} for ${POWER_UPS[power].receives}?`
      : null;
  const caption =
    power !== null && targeting.stage === "confirming" ? tradeCaption(power, targeting.tile) : null;
  const stage = power === null ? "idle" : targeting.stage;
  // A swap hands back a plain tile, so a 2x/3x tile loses its bonus (§44).
  const bonusLost = !spotlight && targeting.stage === "confirming" && targeting.tile.multiplier !== undefined;

  // Each stage says itself once: the rack is waiting, or the felt is asking.
  useEffect(() => {
    if (stage === "picking") AccessibilityInfo.announceForAccessibility(spotlight ? "Choose a table tile" : "Choose one of your tiles to swap");
  }, [stage, spotlight]);
  useEffect(() => {
    if (question !== null) AccessibilityInfo.announceForAccessibility(question);
  }, [question]);

  if (power === null || stage === "idle") return null;

  return (
    <Animated.View
      entering={FadeIn.duration(160)}
      exiting={FadeOut.duration(140)}
      // Choosing, the layer only dims: the tap that names a tile reaches the table under it.
      pointerEvents={stage === "picking" ? "box-none" : "auto"}
      style={styles.layer}
    >
      <Pressable
        accessibilityLabel="Cancel using your power"
        accessibilityRole="button"
        onPress={onCancel}
        // Picking, the felt must still take the tap that names the tile; CANCEL backs out.
        pointerEvents={stage === "picking" ? "none" : "auto"}
        style={[styles.scrim, stage === "picking" && styles.scrimClear]}
        testID="power-scrim"
      />
      {question === null ? (
        <View pointerEvents="box-none" style={styles.hintRow}>
          <FeltSheet radius={16} style={styles.hintBar}>
            <View style={styles.hintText}>
              <Text style={styles.hintTitle}>{spotlight ? "TAP A TABLE TILE" : "TAP A TILE TO SWAP"}</Text>
              <Text style={styles.caption}>{POWER_UPS[power].title.toUpperCase()}</Text>
            </View>
            <Pressable
              accessibilityLabel="Cancel"
              accessibilityRole="button"
              onPress={onCancel}
              style={wordBuilderStyles.blankClose}
              testID="power-cancel"
            >
              <Text style={wordBuilderStyles.blankCloseText}>✕</Text>
            </Pressable>
          </FeltSheet>
        </View>
      ) : (
        <View pointerEvents="box-none" style={styles.center}>
          <FeltSheet radius={18} style={styles.confirmPanel} testID="power-confirm-sheet">
            <PowerCard id={power} width={CONFIRM_CARD_WIDTH} />
            <Text style={styles.question}>{question}</Text>
            {caption === null ? null : <Text style={[styles.caption, styles.tradeCaption]}>{caption}</Text>}
            {bonusLost ? <Text style={styles.warning}>This tile&apos;s bonus will be lost</Text> : null}
            <View style={styles.actions}>
              <GameButton label="CANCEL" onPress={onCancel} style={styles.action} testID="power-cancel" variant="wood" />
              <GameButton
                label={spotlight ? "SPOTLIGHT" : "SWAP"}
                onPress={onConfirm}
                style={styles.action}
                testID="power-confirm"
                variant="gold"
              />
            </View>
          </FeltSheet>
        </View>
      )}
    </Animated.View>
  );
}

/**
 * The table's sheet for a power: deep felt green, the phase pill's, inside a 2pt orange edge. The
 * gradient fills the sheet rather than clipping it, so iOS keeps the drop shadow.
 */
function FeltSheet({
  radius: corner,
  style,
  testID,
  children,
}: {
  radius: number;
  style: StyleProp<ViewStyle>;
  testID?: string;
  children: ReactNode;
}) {
  return (
    <View style={[styles.sheet, { borderRadius: corner }, style]} testID={testID}>
      <LinearGradient
        colors={[ledger.modeTile, ledger.modeTileEdge]}
        pointerEvents="none"
        style={[FILL, { borderRadius: corner - 2 }]}
      />
      {children}
    </View>
  );
}

/** The letters a tile prints, as the confirm names it: "A", or a choice tile's "A/E" (§10). */
function tileLetters(tile: TileData): string {
  return "alternativeLetter" in tile ? `${tile.letter}/${tile.alternativeLetter}` : tile.letter;
}

/** The points a tile prints, both faces for a choice tile: "4", or "10/5". */
function tilePoints(tile: TileData): string {
  return "alternativeLetter" in tile ? `${tile.points}/${tile.alternativePoints}` : `${tile.points}`;
}

/** The confirm's small print, spelling out the trade: "YOUR P (4) GOES · THE BLANK SCORES 0". */
function tradeCaption(power: PowerUpId, tile: TileData): string {
  const named = `${tileLetters(tile)} (${tilePoints(tile)})`;
  const { family, receives } = POWER_UPS[power];
  if (family === "spotlight") return `THE ${named} SCORES DOUBLE · FOR EVERYONE`;
  if (family === "blankTile") return `YOUR ${named} GOES · THE BLANK SCORES 0`;
  return `YOUR ${named} GOES · ${receives.toUpperCase()} COMES IN`;
}

/**
 * The region the prompt covers, spelled out: `StyleSheet.absoluteFill` is a registered style on the
 * web and spreads to nothing there.
 */
const FILL = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

const styles = StyleSheet.create({
  unavailableHint: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: 1,
    bottom: "100%",
    marginBottom: spacing.sm,
    padding: spacing.sm,
    position: "absolute",
    width: 220,
    zIndex: 30,
  },
  chip: { alignItems: "center", borderRadius: 6, justifyContent: "center" },
  chipReady: glow(colors.gold, 8),
  chipIdle: { opacity: 0.45 },
  chipActive: { transform: [{ translateY: -4 }, { scale: 1.12 }] },
  usedBand: {
    backgroundColor: "rgba(20,8,4,0.82)",
    borderColor: palette.gold400,
    borderBottomWidth: 1,
    borderTopWidth: 1,
    left: -3,
    paddingVertical: 1,
    position: "absolute",
    right: -3,
    transform: [{ rotate: "-18deg" }],
  },
  usedText: {
    color: colors.goldHi,
    fontFamily: fonts.arcade,
    fontSize: 7,
    letterSpacing: 0.5,
    textAlign: "center",
  },
  layer: { ...FILL, zIndex: 20 },
  scrim: { ...FILL, backgroundColor: "rgba(0,0,0,0.45)" },
  // Choosing, the felt stays lit so the tiles are easy to read.
  scrimClear: { backgroundColor: "transparent" },
  hintRow: {
    alignItems: "center",
    bottom: spacing.sm,
    left: spacing.md,
    position: "absolute",
    right: spacing.md,
  },
  center: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  sheet: {
    alignItems: "center",
    borderColor: ledger.goldEdge,
    borderWidth: 2,
    ...glow("#000", 14),
  },
  hintBar: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 54,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  hintText: { flex: 1, gap: 2 },
  hintTitle: { color: ledger.onFelt, fontFamily: fonts.arcade, fontSize: 15, letterSpacing: 0.45 },
  confirmPanel: {
    gap: spacing.md,
    maxWidth: 320,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: 18,
    width: "100%",
  },
  hint: { color: colors.textBright, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  question: {
    color: ledger.onFelt,
    fontFamily: fonts.arcade,
    fontSize: 19,
    letterSpacing: 0.4,
    textAlign: "center",
  },
  caption: {
    color: "rgba(243,230,196,0.6)",
    fontFamily: fonts.rubikSemiBold,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  // Tucked up under the question, as the design sets it.
  tradeCaption: { marginTop: -spacing.sm, textAlign: "center" },
  warning: { color: ledger.goldText, fontFamily: fonts.sansMedium, fontSize: 13, textAlign: "center" },
  actions: { alignSelf: "stretch", flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
