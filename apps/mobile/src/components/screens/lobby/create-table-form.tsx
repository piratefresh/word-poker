/** Create a table with the shared validator and the night lobby's visual controls. */
import { BottomSheet } from "@expo/ui";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, StyleSheet, TextInput, View } from "react-native";

import {
  BUY_IN_PRESETS,
  MAX_SEATS,
  MIN_SEATS,
  validateRoomCreateOptions,
  type BuyInPreset,
  type PowerUpDealMode,
  type RoomCreateField,
} from "@wordpoker/contracts";

import { fonts, nightLobby } from "@/constants/theme";
import { createTable } from "@/features/online/room-session";

import { CreateTableLayout } from "./create-table-layout";
import { NightLobbyButton } from "./night-lobby-button";

export interface CreateTableFormProps {
  visible: boolean;
  onClose: () => void;
  onCreated?: (roomId: string) => void;
}
interface Refusal {
  readonly field: RoomCreateField | null;
  readonly message: string;
}

const SEAT_COUNTS = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);
const DEFAULT_SEATS = MAX_SEATS;

export function CreateTableForm({ visible, onClose, onCreated }: CreateTableFormProps) {
  const [name, setName] = useState("");
  const [buyIn, setBuyIn] = useState<BuyInPreset>(BUY_IN_PRESETS[0]);
  const [maxSeats, setMaxSeats] = useState(DEFAULT_SEATS);
  const [deal, setDeal] = useState<PowerUpDealMode>("off");
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dismiss = () => {
    setRefusal(null);
    onClose();
  };

  const submit = () => {
    // The validator trims the name and is the server's own answer, so a name of spaces is
    // refused here rather than on the wire.
    const checked = validateRoomCreateOptions({ name, buyIn, maxSeats, powerUps: { deal } });
    if (!checked.ok) {
      setRefusal({ field: checked.refusal.field, message: checked.refusal.message });
      return;
    }

    setRefusal(null);
    setSubmitting(true);
    void createTable(checked.options)
      .then((roomId) => {
        setName("");
        setRefusal(null);
        onClose();
        if (onCreated) onCreated(roomId);
        else router.push({ pathname: "/online/[roomId]", params: { roomId } });
      })
      .catch((failure: unknown) => {
        const message = failure instanceof Error ? failure.message : "Couldn't create that table.";
        console.warn("[create-table] create failed", message);
        setRefusal({ field: null, message });
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <BottomSheet
      containerColor={nightLobby.panel.navy[0]}
      contentPadding={0}
      isPresented={visible}
      onDismiss={dismiss}
      showDragIndicator={false}
      snapPoints={["full"]}
      testID="create-table-sheet"
    >
      <CreateTableLayout
        actions={
        <View style={styles.actions} testID="create-table-actions">
          <NightLobbyButton
            disabled={submitting}
            label={submitting ? "CREATING…" : `CREATE · ${buyIn.toLocaleString("en-US")}`}
            onPress={submit}
            testID="create-table-submit"
          />
          <Pressable
            accessibilityRole="button"
            onPress={dismiss}
            style={styles.cancel}
            testID="create-table-cancel"
          >
            <Text style={styles.cancelLabel}>CANCEL</Text>
          </Pressable>
        </View>
        }
      >
        <View style={styles.fields}>
          <View>
            <Text accessibilityRole="header" style={styles.title}>
              CREATE A TABLE
            </Text>
            <Text style={styles.kicker}>STAKES AND SEATS</Text>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>TABLE NAME</Text>
            <TextInput
              accessibilityLabel="Table name"
              autoCapitalize="words"
              autoCorrect={false}
              onChangeText={setName}
              placeholder="Sunday felt"
              placeholderTextColor="#b09a74"
              style={styles.input}
              testID="create-table-name"
              value={name}
            />
            {refusal?.field === "name" ? (
              <Text accessibilityRole="alert" style={styles.refusal} testID="create-table-name-refusal">
                {refusal.message}
              </Text>
            ) : null}
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>BUY-IN</Text>
            <View style={styles.choices} testID="create-table-buy-in">
              {BUY_IN_PRESETS.map((preset) => (
                <Pressable
                  key={preset}
                  accessibilityRole="radio"
                  accessibilityLabel={`${preset.toLocaleString("en-US")} coins buy-in`}
                  aria-checked={buyIn === preset}
                  accessibilityState={{ checked: buyIn === preset }}
                  onPress={() => setBuyIn(preset)}
                  style={({ pressed }) => [styles.buyIn, buyIn === preset && styles.selected, pressed && styles.pressed]}
                  testID={`create-table-buy-in-${preset}`}
                >
                  {buyIn === preset ? <LinearGradient colors={nightLobby.gold.button} style={StyleSheet.absoluteFill} /> : null}
                  <View style={styles.coin} />
                  <Text style={[styles.choiceText, buyIn === preset && styles.selectedText]}>
                    {preset.toLocaleString("en-US")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>SEATS</Text>
            <View style={styles.choices} testID="create-table-seats">
              {SEAT_COUNTS.map((count) => (
                <Pressable
                  key={count}
                  accessibilityRole="radio"
                  accessibilityLabel={`${count} seats`}
                  aria-checked={maxSeats === count}
                  accessibilityState={{ checked: maxSeats === count }}
                  onPress={() => setMaxSeats(count)}
                  style={({ pressed }) => [styles.seat, maxSeats === count && styles.selected, pressed && styles.pressed]}
                  testID={`create-table-seats-${count}`}
                >
                  {maxSeats === count ? <LinearGradient colors={nightLobby.gold.button} style={StyleSheet.absoluteFill} /> : null}
                  <Text style={[styles.seatText, maxSeats === count && styles.selectedText]}>{count}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>POWER-UPS</Text>
            <View style={styles.choices} testID="create-table-power-ups">
              {(["off", "choose3"] as const).map((mode) => (
                <Pressable
                  key={mode}
                  accessibilityRole="radio"
                  accessibilityLabel={mode === "off" ? "Classic" : "Wild Power"}
                  aria-checked={deal === mode}
                  accessibilityState={{ checked: deal === mode }}
                  onPress={() => setDeal(mode)}
                  style={({ pressed }) => [styles.power, deal === mode && styles.powerSelected, pressed && styles.pressed]}
                  testID={`create-table-power-ups-${mode}`}
                >
                  <Text style={styles.powerTitle}>
                    {mode === "off" ? "CLASSIC" : "WILD POWER"}
                  </Text>
                  <Text style={styles.powerCopy}>
                    {mode === "off" ? "Standard rules" : "Pick a power each hand"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          {refusal !== null && refusal.field !== "name" ? (
            <Text accessibilityRole="alert" style={styles.refusal} testID="create-table-error">
              {refusal.message}
            </Text>
          ) : null}
        </View>
      </CreateTableLayout>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fields: { gap: 16, paddingBottom: 8 },
  title: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: 28, letterSpacing: 0.6 },
  kicker: { color: nightLobby.gold.light, fontFamily: fonts.rubikSemiBold, fontSize: 11, letterSpacing: 1.5 },
  field: { gap: 8 },
  fieldLabel: { color: nightLobby.text.label, fontFamily: fonts.rubikSemiBold, fontSize: 11, letterSpacing: 1.4 },
  input: { backgroundColor: "#f3e6c4", color: "#3a2210", borderRadius: 12, borderBottomWidth: 4, borderBottomColor: "#c48743", fontFamily: fonts.arcade, fontSize: 18, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12 },
  choices: { flexDirection: "row", gap: 10 },
  buyIn: { flex: 1, minHeight: 46, borderWidth: 2, borderBottomWidth: 4, borderColor: "#343c55", borderRadius: 12, backgroundColor: "#0a1028", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, overflow: "hidden" },
  choiceText: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: 16 },
  selected: { borderColor: "#c68d35", borderBottomColor: "#9a5f1c", backgroundColor: nightLobby.gold.button[0] },
  selectedText: { color: nightLobby.gold.buttonText },
  coin: { width: 11, height: 11, borderRadius: 6, backgroundColor: "#f7d77a", borderBottomWidth: 2, borderBottomColor: "#c98a2c" },
  seat: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderBottomWidth: 4, borderColor: "#343c55", backgroundColor: "#0a1028", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  seatText: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: 21 },
  power: { flex: 1, minHeight: 80, padding: 12, gap: 4, borderWidth: 2, borderRadius: 14, borderColor: "#343c55", backgroundColor: "#0a1028" },
  powerSelected: { borderColor: "#f7d77a", backgroundColor: "rgba(247,215,122,0.12)" },
  powerTitle: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: 18 },
  powerCopy: { color: nightLobby.text.muted, fontFamily: fonts.rubikMedium, fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.8 },
  refusal: { color: "#ff9387", fontFamily: fonts.rubik, fontSize: 13, lineHeight: 18 },
  actions: { paddingTop: 12, flexShrink: 0 },
  cancel: { alignItems: "center", justifyContent: "center", minHeight: 48 },
  cancelLabel: { color: nightLobby.text.muted, fontFamily: fonts.arcade, fontSize: 18, letterSpacing: 0.6 },
});
