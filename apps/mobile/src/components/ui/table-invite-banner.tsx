/**
 * table-invite-banner.tsx — "<name> invited you to a table" (STO-584), shown above whatever screen is open.
 * Join takes the seat via the table's own route; the table may have started by then, and the room
 * screen says so ("That table has already started.").
 */

import type { TableInvite } from "@wordpoker/contracts";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";

export function TableInviteBanner({ invite, onDismiss }: { invite: TableInvite | null; onDismiss: () => void }) {
  const insets = useSafeAreaInsets();
  if (!invite) return null;

  return (
    <View accessibilityRole="alert" style={[styles.banner, { top: insets.top + spacing.sm }]} testID="table-invite-banner">
      <Text style={styles.text}>{`${invite.fromName} invited you to a table`}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onDismiss();
            router.push({ pathname: "/online/[roomId]", params: { roomId: invite.roomId } });
          }}
          style={styles.join}
          testID="table-invite-join"
        >
          <Text style={styles.joinLabel}>Join</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onDismiss} testID="table-invite-dismiss">
          <Text style={styles.dismiss}>Dismiss</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: spacing.gutter,
    right: spacing.gutter,
    zIndex: 100,
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.card,
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderStrong,
    borderWidth: 1,
  },
  text: { color: colors.textBright, fontFamily: fonts.sansBold, fontSize: fontSize.body },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  join: { backgroundColor: colors.gold, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  joinLabel: { color: colors.onGold, fontFamily: fonts.ui, fontSize: fontSize.small },
  dismiss: { color: colors.textDim, fontFamily: fonts.sansBold, fontSize: fontSize.small },
});
