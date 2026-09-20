import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * What a touch on the tiles feels like: a lift when one comes off a tray or out of the word,
 * a softer knock when one lands.
 *
 * Haptics are a courtesy, and every platform is allowed to refuse them — a phone in Low
 * Power Mode, a device with no motor, a browser without the Vibration API — so a refused
 * call is silence here rather than an error worth raising. Android gets the haptics engine
 * rather than the vibrator, which is the API the platform asks apps to use for this.
 */
export function haptic(kind: "lift" | "settle"): void {
  const feedback =
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(
          kind === "lift"
            ? Haptics.AndroidHaptics.Drag_Start
            : Haptics.AndroidHaptics.Context_Click,
        )
      : Haptics.impactAsync(
          kind === "lift"
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Soft,
        );

  void feedback.catch(() => undefined);
}
