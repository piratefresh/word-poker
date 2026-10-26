import { StyleSheet, View } from "react-native";

import { type TurnTimerView } from "@/components/hud/turn-clock";
import { CoachTarget } from "@/components/ui/coach";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts } from "@/constants/theme";

import type { GameScreenState } from "../game-types";

export function WordSubmissionControls({
  status,
  timer,
  disabled,
  canFold,
  onSubmit,
  onFold,
}: {
  status: NonNullable<GameScreenState["wordSubmission"]>["status"];
  timer?: TurnTimerView;
  disabled: boolean;
  canFold: boolean;
  onSubmit?: () => void;
  onFold?: () => void;
}) {
  const drafting = status === "drafting" || status === "submitting";

  return (
    <View pointerEvents="box-none" style={styles.panel} testID="word-submission-controls">
      {drafting ? (
        <View pointerEvents="box-none" style={styles.actions}>
          {/* <GameButton
            label="FOLD"
            variant="danger"
            disabled={!canFold || status === "submitting"}
            onPress={onFold}
            style={styles.action}
            testID="action-fold"
          /> */}
          <CoachTarget id="wager" style={styles.action}>
            <CoachTarget id="check">
              <GameButton
                label={status === "submitting" ? "SUBMITTING…" : "SUBMIT WORD"}
                accessibilityLabel={
                  status === "submitting" ? "Submitting word" : "Submit word"
                }
                variant="gold"
                disabled={disabled || status === "submitting"}
                onPress={onSubmit}
                testID="action-check-call"
              />
            </CoachTarget>
          </CoachTarget>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 5, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 7 },
  title: {
    color: colors.gold,
    fontFamily: fonts.sansBold,
    fontSize: 13,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: 8 },
  // Grows into portrait's full-width row, but keeps its label's width in landscape's row, which
  // sizes to its content: `flex: 1` there is a zero basis and the button collapses out of sight.
  action: { flexGrow: 1 },
  countdown: {
    color: colors.text,
    fontFamily: fonts.sansBold,
    fontSize: 12,
    textAlign: "center",
  },
});
