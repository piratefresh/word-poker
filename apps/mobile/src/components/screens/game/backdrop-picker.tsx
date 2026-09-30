import { Host, Picker } from "@expo/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { border, colors, fonts, fontSize, palette, radius, spacing } from "@/constants/theme";

import {
  BACKDROP_LABEL,
  BACKDROP_STYLES,
  setBackdropStyle,
  useBackdropStyle,
  type BackdropStyle,
} from "./backdrop-style";

export interface BackdropPickerProps {
  /** Where the panel hangs from the top of the screen: just under the HUD's gear. */
  top: number;
  onClose: () => void;
}

/**
 * The gear's panel until the table has a settings sheet: one picker for the room's backdrop. A
 * tap anywhere off the panel closes it, and the choice lands the moment it is picked.
 */
export function BackdropPicker({ top, onClose }: BackdropPickerProps) {
  const style = useBackdropStyle();
  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityLabel="Close settings"
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.panel, { top }]} testID="backdrop-picker">
        <Text style={styles.label}>BACKDROP</Text>
        <Host colorScheme="dark" matchContents seedColor={colors.gold}>
          <Picker
            onValueChange={(value) => setBackdropStyle(value as BackdropStyle)}
            selectedValue={style}
            testID="backdrop-picker-select"
          >
            {BACKDROP_STYLES.map((option) => (
              <Picker.Item key={option} label={BACKDROP_LABEL[option]} value={option} />
            ))}
          </Picker>
        </Host>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over everything on the felt: the table's content layer sits at zIndex 1, and its tiles and
  // cards carry an elevation that would otherwise draw over the panel on Android.
  overlay: { ...StyleSheet.absoluteFillObject, elevation: 100, zIndex: 100 },
  panel: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    gap: spacing.xs,
    padding: spacing.sm,
    position: "absolute",
    right: spacing.md,
  },
  label: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 1.2,
  },
});
