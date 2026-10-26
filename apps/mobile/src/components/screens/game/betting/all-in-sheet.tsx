import { Modal, StyleSheet, Text, View } from "react-native";

import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";
import { GameButton } from "@/components/ui/game-button";
import { border, colors, fonts, palette, radius } from "@/constants/theme";

/**
 * The all-in confirmation. It is the felt's own surface rather than an OS alert: the amount it
 * commits is the point of the confirmation, and it stays inside the table's frame.
 */
export function AllInSheet({
  visible,
  amount,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  amount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      supportedOrientations={MODAL_ORIENTATIONS}
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.sheetBackdrop}>
        <View style={styles.sheet} testID="all-in-sheet">
          <Text style={styles.sheetTitle}>
            {`ALL IN · $${amount.toLocaleString()}`}
          </Text>
          <Text style={styles.sheetBody}>
            Commits your entire Table Stack.
          </Text>
          <View style={styles.sheetActions}>
            <GameButton
              label="CANCEL"
              onPress={onCancel}
              style={styles.action}
              testID="all-in-cancel"
            />
            <GameButton
              label="CONFIRM ALL IN"
              style={styles.action}
              variant="gold"
              onPress={onConfirm}
              testID="all-in-confirm"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  sheetBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(2,12,9,0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    maxWidth: 320,
    padding: 16,
    width: "100%",
  },
  sheetTitle: {
    color: colors.gold,
    fontFamily: fonts.serifBold,
    fontSize: 18,
    textAlign: "center",
  },
  sheetBody: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 14 },
});
