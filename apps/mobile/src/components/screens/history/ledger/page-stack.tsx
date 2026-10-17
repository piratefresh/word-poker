import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { PageInteraction } from "./page-interaction";

export const PAGE_TURN_MS = 750;
export const PAGE_REVEAL_MS = 450;

/** All three pages stay mounted so a return turn preserves the scroll views. */
export function PageStack({ level, children }: { level: number; children: readonly ReactNode[] }) {
  const reduced = useReduceMotion();
  return <View style={styles.stack} testID="history-screen">
    {children.map((page, index) => <TurningPage key={index} index={index} level={level} reduced={reduced}>{page}</TurningPage>)}
  </View>;
}

function TurningPage({ index, level, reduced, children }: { index: number; level: number; reduced: boolean; children: ReactNode }) {
  const turned = level > index;
  const current = level === index;
  const angle = useSharedValue(turned ? -176 : 0);
  // Seed from the window so a cold detail link's turned pages pivot on the spine from the first frame.
  const [width, setWidth] = useState(useWindowDimensions().width);
  useEffect(() => {
    cancelAnimation(angle);
    const target = turned ? -176 : 0;
    if (reduced) angle.value = target;
    else if (angle.value !== target) angle.value = withTiming(target, { duration: PAGE_TURN_MS, easing: Easing.bezier(.5, .05, .25, 1) });
    return () => cancelAnimation(angle);
  }, [angle, reduced, turned]);
  const front = useAnimatedStyle(() => ({ transform: reduced ? [] : [
    { perspective: 1600 }, { translateX: -width / 2 }, { rotateY: `${angle.value}deg` }, { translateX: width / 2 },
  ] }));
  const back = useAnimatedStyle(() => ({ transform: reduced ? [] : [
    { perspective: 1600 }, { translateX: -width / 2 }, { rotateY: `${angle.value}deg` }, { translateX: width / 2 }, { rotateY: "180deg" },
  ] }));
  return <View testID={`history-page-${index}`} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    pointerEvents={current ? "auto" : "none"} aria-hidden={!current} accessibilityElementsHidden={!current}
    importantForAccessibility={current ? "auto" : "no-hide-descendants"}
    style={[StyleSheet.absoluteFill, { zIndex: 3 - index }, reduced && !current && styles.hidden]}>
    <PageInteraction active={current}>
      <Animated.View style={[styles.face, front]}>{children}</Animated.View>
      {index < 2 ? <Animated.View pointerEvents="none" style={[styles.face, styles.back, back]} /> : null}
    </PageInteraction>
  </View>;
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  face: { ...StyleSheet.absoluteFill, backfaceVisibility: "hidden" },
  back: { backgroundColor: "#123f2a", borderTopLeftRadius: 8, borderBottomLeftRadius: 8, borderTopRightRadius: 2, borderBottomRightRadius: 2 },
  hidden: { display: "none" },
});
