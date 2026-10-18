import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

/**
 * The OS reduce-motion preference.
 *
 * Reanimated supplies the synchronous initial preference, so cold links never
 * animate a frame before the async native read. React Native's subscription also
 * honours changes made while the app is mounted.
 */
export function useReduceMotion(): boolean {
  const initial = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(initial);

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
