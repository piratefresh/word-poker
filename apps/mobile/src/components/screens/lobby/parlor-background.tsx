/**
 * parlor-background.tsx — the room's own light.
 *
 * The whole screen is one radial gradient: the lamp over the felt at the top-left corner, falling
 * into the dark the room ends in. It is drawn as SVG rather than stacked `expo-linear-gradient`
 * bands because only a radial reaches every corner evenly, and it sits behind everything at
 * `pointerEvents="none"` so a scroll that runs over it is still a scroll.
 *
 * The stops are the design's, in one place: the outermost is also painted flat underneath, so a
 * device that renders the gradient short (a very wide window) still shows felt rather than white.
 * The drawing is memoised on the window size — a scroll of the lobby must not rebuild it per frame.
 */

import { useMemo, type ReactElement } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

/** The design's three stops, lit to dark. */
const INNER = "#143829";
const MID = "#0c2620";
const OUTER = "#08201a";

export function ParlorBackground(): ReactElement {
  const { width, height } = useWindowDimensions();

  const field = useMemo(() => {
    // Drawn in the window's own pixels, with the radius reaching past the far corner so the last
    // stop is reached at every aspect ratio the app runs at. A radial gradient in react-native-svg
    // is a circle; this one is wide enough that the ellipse it reads as is the design's.
    const radius = Math.hypot(width, height) * 0.9;

    return (
      <Svg
        height={height}
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        <Defs>
          <RadialGradient
            cx={0}
            cy={0}
            gradientUnits="userSpaceOnUse"
            id="parlor-room-light"
            r={radius}
          >
            <Stop offset="0" stopColor={INNER} />
            <Stop offset="0.45" stopColor={MID} />
            <Stop offset="1" stopColor={OUTER} />
          </RadialGradient>
        </Defs>
        <Rect fill={OUTER} height={height} width={width} />
        <Rect fill="url(#parlor-room-light)" height={height} width={width} />
      </Svg>
    );
  }, [height, width]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {field}
    </View>
  );
}
