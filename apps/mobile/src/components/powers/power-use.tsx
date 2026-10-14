import { useEffect, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { POWER_UPS, type PowerUpId, type Tile as TileData } from "@wordpoker/contracts";

import { useCompactControls, useScreenScale } from "@/components/screens/game/screen-scale";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, glow, palette, radius, spacing } from "@/constants/theme";
import type { PowerView } from "@/features/table/power-view";
import { webTestID } from "@/lib/web-id";

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
  const height = compact ? 44 : 48 * scale;
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
          const nextShowHint = !showHint;
          setShowHint(nextShowHint);
          if (nextShowHint) AccessibilityInfo.announceForAccessibility(hint);
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

/**
 * The felt's side of using a power: while the hero chooses, the felt dims and says what to do;
 * once a tile is chosen, the felt asks to confirm the swap in the catalog's words — "Discard A
 * for a random letter?". Tapping the dimmed felt, or CANCEL, backs out.
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
        style={styles.scrim}
        testID="power-scrim"
      />
      {question === null ? (
        <View pointerEvents="box-none" style={styles.hintRow}>
          <View style={styles.panel}>
            <Text style={styles.hint}>{spotlight ? "Tap a table tile to spotlight it" : "Tap one of your tiles to swap it"}</Text>
            <GameButton compact label="CANCEL" onPress={onCancel} testID="power-cancel" />
          </View>
        </View>
      ) : (
        <View pointerEvents="box-none" style={styles.center}>
          <View style={[styles.panel, styles.confirmPanel]} testID="power-confirm-sheet">
            <PowerCard id={power} width={88} />
            <Text style={styles.question}>{question}</Text>
            {bonusLost ? <Text style={styles.warning}>This tile&apos;s bonus will be lost</Text> : null}
            <View style={styles.actions}>
              <GameButton label="CANCEL" onPress={onCancel} style={styles.action} testID="power-cancel" />
              <GameButton
                label={spotlight ? "SPOTLIGHT" : "SWAP"}
                onPress={onConfirm}
                style={styles.action}
                testID="power-confirm"
                variant="gold"
              />
            </View>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

/** The letters a tile prints, as the confirm names it: "A", or a choice tile's "A/E" (§10). */
function tileLetters(tile: TileData): string {
  return "alternativeLetter" in tile ? `${tile.letter}/${tile.alternativeLetter}` : tile.letter;
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
  chipActive: { transform: [{ translateY: -4 }, { scale: 1.06 }] },
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
  scrim: { ...FILL, backgroundColor: "rgba(2,12,9,0.58)" },
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
  panel: {
    alignItems: "center",
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  confirmPanel: { flexDirection: "column", maxWidth: 300 },
  hint: { color: colors.textBright, flexShrink: 1, fontFamily: fonts.sansMedium, fontSize: 13 },
  question: {
    color: colors.textBright,
    fontFamily: fonts.sansBold,
    fontSize: 15,
    textAlign: "center",
  },
  warning: { color: colors.goldHi, fontFamily: fonts.sansMedium, fontSize: 13, textAlign: "center" },
  actions: { alignSelf: "stretch", flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
});
