/**
 * create-table-form.tsx — §2's create flow: a name, one of three fixed buy-ins, §5's seat cap, and
 * §40's power-ups — Classic, the default, or Wild.
 *
 * The form refuses before it spends a round trip: `validateRoomCreateOptions` is the same function
 * the server runs on the same options, so the field a refusal marks and the sentence it shows are
 * the ones the server would have given. A refusal that comes back from the server anyway (a socket
 * that closed, a create the server judged differently) is shown as the server's own sentence.
 *
 * There is no blinds field: they are derived from the buy-in server-side (`blindsFor`), so no
 * client can propose stakes §2 does not offer.
 *
 * The name field is a React Native `TextInput` hosted in the universal layout (`RNHostView`, the
 * library's bridge for that): the universal `TextInput` is a native control with no web build, and
 * this screen is driven on the web.
 */

import {
  BottomSheet,
  Column,
  Picker,
  RNHostView,
  ScrollView,
  Text,
  type UniversalTextStyle,
} from "@expo/ui";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text as RNText, StyleSheet, TextInput, View } from "react-native";

import {
  BUY_IN_PRESETS,
  MAX_SEATS,
  MIN_SEATS,
  POWER_UP_DEAL_MODES,
  validateRoomCreateOptions,
  type BuyInPreset,
  type PowerUpDealMode,
  type RoomCreateField,
} from "@wordpoker/contracts";

import { GoldButton } from "@/components/ui/gold-button";
import { border, colors, fonts, fontSize, palette, radius, spacing } from "@/constants/theme";
import { formatAmount } from "@/lib/format";
import { DEAL_MODE_NAMES } from "@/features/table/power-view";
import { createTable } from "@/features/online/room-session";

export type CreateTableFormProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * A create's answer to show: the field it is about, or `null` for a sentence about the create as
 * a whole — the server's own refusal names no field we can mark.
 */
interface Refusal {
  readonly field: RoomCreateField | null;
  readonly message: string;
}

/** §5's cap, as a picker's options. */
const SEAT_COUNTS = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

/**
 * A host opens as roomy a table as §5 allows: heads-up is a table two players agree on, not the
 * default a tap lands on.
 */
const DEFAULT_SEATS = MAX_SEATS;

const titleText = {
  color: colors.textBright,
  fontFamily: fonts.serifBold,
  fontSize: fontSize.h3,
} satisfies UniversalTextStyle;

const kickerText = {
  color: colors.gold,
  fontFamily: fonts.mono,
  fontSize: fontSize.micro,
  letterSpacing: 2.2,
} satisfies UniversalTextStyle;

const fieldLabelText = {
  color: colors.textDim,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 1.4,
} satisfies UniversalTextStyle;

const refusalText = {
  color: colors.danger,
  fontFamily: fonts.sans,
  fontSize: fontSize.small,
  lineHeight: 19,
} satisfies UniversalTextStyle;

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    color: colors.textBright,
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  actions: {
    alignSelf: "stretch",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  cancel: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  cancelLabel: {
    color: colors.textDim,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.small,
    letterSpacing: 1,
  },
});

/**
 * §2's create, as a sheet the lobby opens: the options a table is made of, refused where they are
 * wrong and created where they are not, with the new table's own screen the way in.
 */
export function CreateTableForm({ visible, onClose }: CreateTableFormProps) {
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
        router.push({ pathname: "/online/[roomId]", params: { roomId } });
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
      containerColor={palette.felt800}
      isPresented={visible}
      onDismiss={dismiss}
      snapPoints={["full"]}
      testID="create-table-sheet"
    >
      <ScrollView testID="create-table-scroll">
        <Column alignment="start" spacing={spacing.lg}>
          <Column alignment="start" spacing={spacing.xxs}>
            <Text textStyle={titleText}>Create a table</Text>
            <Text textStyle={kickerText}>STAKES AND SEATS</Text>
          </Column>

          <Column alignment="start" spacing={spacing.xs}>
            <Text textStyle={fieldLabelText}>TABLE NAME</Text>
            <RNHostView>
              <TextInput
                accessibilityLabel="Table name"
                autoCapitalize="words"
                autoCorrect={false}
                onChangeText={setName}
                placeholder="Sunday felt"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                testID="create-table-name"
                value={name}
              />
            </RNHostView>
            {refusal?.field === "name" ? (
              <Text testID="create-table-name-refusal" textStyle={refusalText}>
                {refusal.message}
              </Text>
            ) : null}
          </Column>

          <Column alignment="start" spacing={spacing.xs}>
            <Text textStyle={fieldLabelText}>BUY-IN</Text>
            <Picker
              onValueChange={(value) => setBuyIn(value as BuyInPreset)}
              selectedValue={buyIn}
              testID="create-table-buy-in"
            >
              {BUY_IN_PRESETS.map((preset) => (
                <Picker.Item key={preset} label={formatAmount(preset)} value={preset} />
              ))}
            </Picker>
            {refusal?.field === "buyIn" ? (
              <Text testID="create-table-buy-in-refusal" textStyle={refusalText}>
                {refusal.message}
              </Text>
            ) : null}
          </Column>

          <Column alignment="start" spacing={spacing.xs}>
            <Text textStyle={fieldLabelText}>SEATS</Text>
            <Picker
              onValueChange={setMaxSeats}
              selectedValue={maxSeats}
              testID="create-table-seats"
            >
              {SEAT_COUNTS.map((count) => (
                <Picker.Item key={count} label={`${count} seats`} value={count} />
              ))}
            </Picker>
            {refusal?.field === "maxSeats" ? (
              <Text testID="create-table-seats-refusal" textStyle={refusalText}>
                {refusal.message}
              </Text>
            ) : null}
          </Column>

          <Column alignment="start" spacing={spacing.xs}>
            <Text textStyle={fieldLabelText}>POWER-UPS</Text>
            <Picker
              onValueChange={(value) => setDeal(value as PowerUpDealMode)}
              selectedValue={deal}
              testID="create-table-power-ups"
            >
              {POWER_UP_DEAL_MODES.map((mode) => (
                <Picker.Item key={mode} label={DEAL_MODE_NAMES[mode]} value={mode} />
              ))}
            </Picker>
            {refusal?.field === "powerUps" ? (
              <Text testID="create-table-power-ups-refusal" textStyle={refusalText}>
                {refusal.message}
              </Text>
            ) : null}
          </Column>

          {refusal !== null && refusal.field === null ? (
            <Text testID="create-table-error" textStyle={refusalText}>
              {refusal.message}
            </Text>
          ) : null}

          {/* The universal Button draws as dark bare text on the web — invisible on the felt
              (STO-445) — so the actions are the design's gold primary and a text link. */}
          <RNHostView>
            <View style={styles.actions}>
              <GoldButton
                disabled={submitting}
                label={submitting ? "Creating…" : "Create"}
                onPress={submit}
                testID="create-table-submit"
              />
              <Pressable
                accessibilityRole="button"
                onPress={dismiss}
                style={styles.cancel}
                testID="create-table-cancel"
              >
                <RNText style={styles.cancelLabel}>Cancel</RNText>
              </Pressable>
            </View>
          </RNHostView>
        </Column>
      </ScrollView>
    </BottomSheet>
  );
}
