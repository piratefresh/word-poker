import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * What a touch feels like: a lift when a tile comes off a tray or out of the word, a softer
 * knock when one lands, and a win when the hand pays out.
 *
 * `success` is the loudest of the three and is meant to be spent sparingly — one per results
 * screen, not one per animated thing on it.
 *
 * Haptics are a courtesy, and every platform is allowed to refuse them — a phone in Low
 * Power Mode, a device with no motor, a browser without the Vibration API — so a refused
 * call is silence here rather than an error worth raising. Android gets the haptics engine
 * rather than the vibrator, which is the API the platform asks apps to use for this.
 */
export type HapticKind = "lift" | "settle" | "success";

export function haptic(kind: HapticKind): void {
  void feedbackFor(kind).catch(() => undefined);
}

/** The vocabulary above, mapped onto each platform's own API in one place. */
function feedbackFor(kind: HapticKind): Promise<void> {
  if (Platform.OS === "android") {
    return Haptics.performAndroidHapticsAsync(
      kind === "success"
        ? Haptics.AndroidHaptics.Confirm
        : kind === "lift"
          ? Haptics.AndroidHaptics.Drag_Start
          : Haptics.AndroidHaptics.Context_Click,
    );
  }

  if (kind === "success")
    return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  return Haptics.impactAsync(
    kind === "lift"
      ? Haptics.ImpactFeedbackStyle.Light
      : Haptics.ImpactFeedbackStyle.Soft,
  );
}
