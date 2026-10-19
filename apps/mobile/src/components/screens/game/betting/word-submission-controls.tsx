import { StyleSheet, Text, View } from "react-native";

import { formatClockMs, type TurnTimerView } from "@/components/hud/turn-clock";
import { CoachTarget } from "@/components/ui/coach";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts } from "@/constants/theme";

import type { GameScreenState } from "../game-types";

export function WordSubmissionControls({ status, timer, disabled, onSubmit }: {
  status: NonNullable<GameScreenState["wordSubmission"]>["status"];
  timer?: TurnTimerView;
  disabled: boolean;
  onSubmit?: () => void;
}) {
  const drafting = status === "drafting" || status === "submitting";
  const title = status === "confirmed"
    ? "WORD SUBMITTED · Waiting for other players"
    : status === "timed-out"
      ? "TIME IS UP · No word submitted"
      : drafting ? "FINAL STAGE · SUBMIT YOUR WORD" : "FINAL STAGE · WORD SUBMISSION";

  return (
    <View style={styles.panel} testID="word-submission-controls">
      <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{title}</Text>
      {drafting ? (
        <Text style={styles.copy}>Betting is complete. Build your best word and submit before time runs out.</Text>
      ) : null}
      {timer ? (
        <Text style={styles.countdown}>Shared submission deadline · {formatClockMs(timer.remainingMs)}</Text>
      ) : null}
      {drafting ? (
        <>
          <CoachTarget id="wager">
            <CoachTarget id="check">
              <GameButton
                label={status === "submitting" ? "SUBMITTING…" : "SUBMIT WORD"}
                accessibilityLabel={status === "submitting" ? "Submitting word" : "Submit word"}
                variant="gold"
                disabled={disabled || status === "submitting"}
                onPress={onSubmit}
                testID="action-check-call"
              />
            </CoachTarget>
          </CoachTarget>
          <Text style={styles.copy}>Submitting locks your word. Word Checker checks validity without submitting.</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 5, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 7 },
  title: { color: colors.gold, fontFamily: fonts.sansBold, fontSize: 13, textAlign: "center" },
  copy: { color: colors.text, fontFamily: fonts.sans, fontSize: 12, textAlign: "center" },
  countdown: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 12, textAlign: "center" },
});
