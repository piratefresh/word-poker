import * as Clipboard from "expo-clipboard";
import { useState, type ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SLOT_POWERS, powerCount, slotLines, type SlotSpellerState } from "@wordpoker/game-rules";

import { colors, fonts, fontSize, opacity, radius, spacing, type } from "@/constants/theme";
import type { SlotRecords } from "@/features/slot-speller/slot-speller-save";
import { webTestID } from "@/lib/ui/web-id";

import { PowerGlyph } from "./slot-shop-panel";

/** The lines the grid pays right now, as chips. */
export function SlotLineChips({ state }: { state: SlotSpellerState }): ReactElement {
  return (
    <View accessibilityLabel="Paying lines" style={styles.chips} testID="slot-lines">
      {slotLines(state).map((line) => (
        <View key={line.name} style={styles.chip}>
          <Text style={styles.chipText}>{line.name}</Text>
        </View>
      ))}
    </View>
  );
}

/** The powers the run holds. */
export function SlotPowersPanel({ state }: { state: SlotSpellerState }): ReactElement {
  const held = SLOT_POWERS.filter((power) => powerCount(state.powers, power.id) > 0);
  return (
    <View style={styles.panel} testID="slot-powers">
      <Text style={styles.heading}>POWERS</Text>
      {held.length === 0 ? (
        <Text style={styles.dim}>None yet — clear a round to shop for them.</Text>
      ) : (
        held.map((power) => {
          const count = powerCount(state.powers, power.id);
          return (
            <View key={power.id} style={styles.power}>
              <PowerGlyph power={power} />
              <View style={styles.powerText}>
                <Text style={styles.name}>{count > 1 ? `${power.name} ×${count}` : power.name}</Text>
                <Text style={styles.dim}>{power.description}</Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

/** What every run on this device has reached. */
export function SlotRecordsBlock({ records }: { records: SlotRecords }): ReactElement {
  const names = SLOT_POWERS.filter((power) => records.discovered.includes(power.id)).map((power) => power.name);
  return (
    <View style={styles.panel} testID="slot-records">
      <Text style={styles.heading}>RECORDS</Text>
      <Row label="Furthest round cleared" value={records.furthestRound === 0 ? "–" : `${records.furthestRound}`} />
      <Row label="Best word" value={records.bestWord === null ? "–" : `${records.bestWord.word} · ${records.bestWord.score}`} />
      <Row label="Powers discovered" value={`${names.length} of ${SLOT_POWERS.length}`} />
      {names.length > 0 ? <Text style={styles.dim}>{names.join(", ")}</Text> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.dim}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export interface SlotSeedRowProps {
  seed: string;
  onRestart: () => void;
  onNewRun: () => void;
}

/** The run's seed, to copy and share, with Restart (same seed) and New run (a new one). */
export function SlotSeedRow({ seed, onRestart, onNewRun }: SlotSeedRowProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    Clipboard.setStringAsync(seed)
      .then((ok) => setCopied(ok))
      .catch(() => setCopied(false));
  };
  return (
    <View style={styles.seedRow}>
      <Text accessibilityLabel={`Seed ${seed}`} style={styles.seed} testID="slot-seed">
        {seed}
      </Text>
      <SmallButton label={copied ? "Copied" : "Copy seed"} onPress={copy} testID="slot-copy-seed" />
      <View style={styles.spacer} />
      <SmallButton label="Restart" onPress={onRestart} testID="slot-restart" />
      <SmallButton label="New run" onPress={onNewRun} testID="slot-header-new-run" />
    </View>
  );
}

function SmallButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }): ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={6}
      id={webTestID(testID)}
      onPress={onPress}
      style={({ pressed }) => [styles.small, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.xs },
  chip: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { fontFamily: fonts.uiMedium, fontSize: fontSize.caption, color: colors.textDim },
  panel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  heading: { ...type.label, fontSize: fontSize.micro },
  power: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  powerText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.ui, fontSize: fontSize.body, color: colors.textBright },
  dim: { ...type.bodyDim, fontSize: fontSize.small },
  row: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  value: { ...type.body, fontSize: fontSize.small, flexShrink: 1, textAlign: "right", fontFamily: fonts.sansBold },
  seedRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  seed: { fontFamily: fonts.ui, fontSize: fontSize.small, letterSpacing: 2, color: colors.goldHi, marginRight: spacing.xxs },
  spacer: { flex: 1 },
  small: {
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  pressed: { opacity: opacity.pressed },
  smallText: { fontFamily: fonts.ui, fontSize: fontSize.caption, color: colors.gold },
});
