import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/**
 * The OS reduce-motion preference.
 *
 * Read from React Native rather than Reanimated: this value decides the shared
 * clock's tick cadence, and the clock has no business depending on an animation
 * library to know how fast to tick. Subscribing to the change event means a player
 * toggling the setting mid-hand is honoured without a remount.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
