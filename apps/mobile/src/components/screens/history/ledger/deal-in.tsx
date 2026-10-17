import { useEffect } from "react";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

/** Activate with the page, not with viewport visibility; scrolling never replays the deal. */
export function DealIn({ children, index, baseDelay = 0, active = true }: {
  children: React.ReactNode;
  index: number;
  baseDelay?: number;
  active?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  const opacity = useSharedValue(reducedMotion ? 1 : 0);
  // Synchronizes the UI-thread animation with page visibility.
  useEffect(() => {
    if (reducedMotion || !active) {
      progress.value = 1;
      opacity.value = 1;
      return;
    }
    const delay = baseDelay + Math.min(9, Math.max(0, index)) * 55;
    progress.value = 0;
    opacity.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 450, easing: Easing.bezier(.3, 1.3, .5, 1) }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    return () => { cancelAnimation(progress); cancelAnimation(opacity); };
  }, [active, baseDelay, index, reducedMotion, progress, opacity]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: (1 - progress.value) * 28 }, { rotate: `${(1 - progress.value) * 1.5}deg` }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
