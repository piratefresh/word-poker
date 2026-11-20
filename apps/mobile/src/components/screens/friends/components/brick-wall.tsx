import { StyleSheet } from "react-native";
import Svg, { Defs, Line, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";

/**
 * The club's red brick wall behind the Friends screen: a drawn placeholder (brick, mortar, a pink
 * neon wash under the sign, a vignette). The painted wall replaces this file's body with an
 * `ImageBackground`; nothing else on the screen knows how the wall is drawn.
 */
export function BrickWall() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
      <Defs>
        <Pattern id="friends-brick" width={46} height={46} patternUnits="userSpaceOnUse">
          <Rect width={46} height={46} fill="#7b3238" />
          <Line x1={0} y1={1} x2={46} y2={1} stroke="rgba(38,10,16,0.5)" strokeWidth={2} />
          <Line x1={0} y1={24} x2={46} y2={24} stroke="rgba(38,10,16,0.5)" strokeWidth={2} />
          <Line x1={1} y1={0} x2={1} y2={23} stroke="rgba(38,10,16,0.4)" strokeWidth={2} />
          <Line x1={24} y1={23} x2={24} y2={46} stroke="rgba(38,10,16,0.4)" strokeWidth={2} />
        </Pattern>
        <RadialGradient id="friends-neon" cx="50%" cy="9%" rx="80%" ry="26%">
          <Stop offset="0" stopColor="#ff5a8c" stopOpacity={0.3} />
          <Stop offset="0.7" stopColor="#ff5a8c" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="friends-vignette" cx="50%" cy="50%" r="70%">
          <Stop offset="0" stopColor="#0e0a28" stopOpacity={0} />
          <Stop offset="1" stopColor="#0e0a28" stopOpacity={0.6} />
        </RadialGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#friends-brick)" />
      <Rect width="100%" height="100%" fill="url(#friends-vignette)" />
      <Rect width="100%" height="100%" fill="url(#friends-neon)" />
    </Svg>
  );
}
