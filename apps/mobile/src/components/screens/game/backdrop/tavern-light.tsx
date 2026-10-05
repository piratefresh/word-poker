import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { useFrameTime } from "@/components/table/mesh-gradiant/useFrameTime";

type LightPool = readonly [x: number, y: number, rx: number, ry: number];

// Coordinates belong to the paintings, so cover cropping keeps light on its source.
const LIGHTS = {
  landscape: {
    viewBox: "0 0 1672 941",
    left: [[65, 235, 360, 245], [165, 805, 410, 150]],
    right: [[1585, 295, 295, 210], [1535, 850, 340, 150]],
    window: [[155, 65, 230, 220], [915, 90, 330, 150]],
  },
  portrait: {
    viewBox: "0 0 941 1672",
    left: [[60, 380, 290, 320], [110, 1490, 290, 210]],
    right: [[895, 370, 240, 270], [850, 1510, 280, 210]],
    window: [[25, 105, 170, 265], [510, 145, 300, 260]],
  },
} satisfies Record<string, {
  viewBox: string;
  left: readonly LightPool[];
  right: readonly LightPool[];
  window: readonly LightPool[];
}>;

/** Ambient reflected light, below all game chrome; reduced motion keeps the pools steady. */
export function TavernLight({ landscape }: { landscape: boolean }) {
  const lights = LIGHTS[landscape ? "landscape" : "portrait"];
  const reduced = useReducedMotion();
  const time = useFrameTime({ animated: !reduced, fpsLock: 24, speed: 1 });
  const leftStyle = useAnimatedStyle(() => ({
    opacity: 0.76 + Math.sin(time.value * 1.7) * 0.09
      + Math.sin(time.value * 4.1) * 0.035 + Math.sin(time.value * 7.3) * 0.015,
  }));
  const rightStyle = useAnimatedStyle(() => ({
    opacity: 0.73 + Math.sin(time.value * 1.3 + 1.8) * 0.08
      + Math.sin(time.value * 3.7 + 0.6) * 0.03,
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.root}
      testID="tavern-light"
    >
      <LightPools color="#65BDE8" pools={lights.window} strength={0.075} viewBox={lights.viewBox} />
      <Animated.View style={[StyleSheet.absoluteFill, leftStyle]}>
        <LightPools color="#FFB448" pools={lights.left} strength={0.19} viewBox={lights.viewBox} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, rightStyle]}>
        <LightPools color="#FF922E" pools={lights.right} strength={0.14} viewBox={lights.viewBox} />
      </Animated.View>
    </View>
  );
}

/** Static SVG pools; only their enclosing view's opacity changes each frame. */
function LightPools({ color, pools, strength, viewBox }: {
  color: string;
  pools: readonly LightPool[];
  strength: number;
  viewBox: string;
}) {
  const id = `tavern-light-${useId().replace(/:/g, "")}`;
  return (
    <Svg
      height="100%"
      width="100%"
      pointerEvents="none"
      preserveAspectRatio="xMidYMid slice"
      style={StyleSheet.absoluteFill}
      viewBox={viewBox}
    >
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={strength} />
          <Stop offset="0.35" stopColor={color} stopOpacity={strength * 0.55} />
          <Stop offset="0.7" stopColor={color} stopOpacity={strength * 0.14} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {pools.map(([x, y, rx, ry], index) => (
        <Ellipse key={index} cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${id})`} />
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, overflow: "hidden" },
});
