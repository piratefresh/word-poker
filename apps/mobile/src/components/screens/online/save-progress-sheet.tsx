/**
 * save-progress-sheet.tsx — a guest's offer at the results screen: make an account to keep playing.
 *
 * Guests sit down with no sign-up (STO-581); this is where the account is asked for, once they have
 * seen what the game is. Registering and verifying the email pays the Wallet's welcome grant.
 */

import { BottomSheet, RNHostView } from "@expo/ui";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GoldButton } from "@/components/ui/gold-button";
import { colors, fonts, fontSize, palette, spacing } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

export function SaveProgressSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet
      containerColor={palette.felt800}
      isPresented={visible}
      onDismiss={onClose}
      testID="save-progress-sheet"
    >
      <RNHostView matchContents>
        <View style={styles.sheet}>
          <Text style={styles.title}>Save your progress?</Text>
          <Text style={styles.body}>
            Make a free account to keep the hands you've played and start with a coin bonus.
          </Text>
          <GoldButton
            label="CREATE ACCOUNT"
            onPress={() => {
              onClose();
              router.push("/sign-up");
            }}
            testID="save-progress-register"
          />
          <Pressable
            accessibilityRole="button"
            id={webTestID("save-progress-later")}
            onPress={onClose}
            style={styles.later}
            testID="save-progress-later"
          >
            <Text style={styles.laterLabel}>Not now</Text>
          </Pressable>
        </View>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { alignItems: "center", gap: spacing.md, padding: spacing.lg },
  title: { color: colors.textBright, fontFamily: fonts.serifBold, fontSize: fontSize.h3 },
  body: { color: colors.textDim, fontFamily: fonts.sansBold, fontSize: fontSize.small, textAlign: "center" },
  later: { alignItems: "center", paddingVertical: spacing.sm },
  laterLabel: { color: colors.textDim, fontFamily: fonts.sansBold, fontSize: fontSize.small, letterSpacing: 1 },
});
