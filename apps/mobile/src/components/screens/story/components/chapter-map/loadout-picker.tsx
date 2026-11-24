import type { ReactElement } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { POWER_UPS, type PowerUpId } from "@wordpoker/contracts";

import { PowerEmblem, powerCardLabel } from "@/components/powers";
import { fonts } from "@/constants/theme";

import { ink, lilita } from "./chapter-map-ink";

export interface LoadoutPickerProps {
  pool: readonly PowerUpId[];
  /** How many the loadout holds. */
  size: number;
  picked: readonly PowerUpId[];
  /** Powers the coach has not introduced yet, marked NEW. */
  fresh: readonly PowerUpId[];
  onChange: (picked: PowerUpId[]) => void;
}

/** The pick a full loadout makes on another tap: the oldest pick gives way, so a tap always lands. */
export function togglePick(picked: readonly PowerUpId[], id: PowerUpId, size: number): PowerUpId[] {
  if (picked.includes(id)) return picked.filter((held) => held !== id);
  return [...picked, id].slice(-size);
}

/**
 * The final chapter's loadout (§46): it has no hands to draft from, so the player picks up to
 * `size` powers straight from the pool before the boss hand. A picked card is ringed in gold with
 * a check, so it reads without colour.
 */
export function LoadoutPicker({ pool, size, picked, fresh, onChange }: LoadoutPickerProps): ReactElement {
  return (
    <View style={styles.picker} testID="story-loadout">
      <Text style={styles.heading}>{`Pick ${size} powers · ${picked.length}/${size}`}</Text>
      <View style={styles.cards}>
        {pool.map((id) => {
          const on = picked.includes(id);
          return (
            <Pressable
              accessibilityLabel={powerCardLabel(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={id}
              onPress={() => onChange(togglePick(picked, id, size))}
              style={[styles.card, on && styles.cardOn]}
              testID={`story-loadout-${id}`}
            >
              {on ? (
                <View style={styles.check}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              ) : null}
              {fresh.includes(id) ? <Text style={styles.fresh}>NEW</Text> : null}
              <PowerEmblem icon={POWER_UPS[id].icon} size={38} />
              <Text numberOfLines={2} style={styles.name}>
                {POWER_UPS[id].title.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picker: { gap: 8, width: "100%" },
  heading: { color: "#f7d77a", fontFamily: lilita, fontSize: 13, letterSpacing: 1, textAlign: "center" },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  card: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.25)", borderColor: "rgba(243,230,196,0.16)", borderRadius: 14, borderWidth: 3, gap: 4, paddingHorizontal: 4, paddingVertical: 8, width: "31%" },
  cardOn: { backgroundColor: "rgba(247,215,122,0.12)", borderColor: "#f7d77a" },
  check: { alignItems: "center", backgroundColor: "#f7d77a", borderRadius: 11, height: 22, justifyContent: "center", position: "absolute", right: -7, top: -7, width: 22, zIndex: 1 },
  checkMark: { color: "#4a2608", fontFamily: fonts.rubikSemiBold, fontSize: 13 },
  fresh: { backgroundColor: "#f7d77a", borderRadius: 6, color: "#4a2608", fontFamily: fonts.rubikSemiBold, fontSize: 10, left: -6, letterSpacing: 1, overflow: "hidden", paddingHorizontal: 5, paddingVertical: 1, position: "absolute", top: -7, zIndex: 1 },
  name: { color: ink.cream, fontFamily: lilita, fontSize: 12, textAlign: "center" },
});
