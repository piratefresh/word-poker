import { useId, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";

export interface SeatBeamProps {
  /** Only the seat whose turn is running shows the fill. */
  active: boolean;
  /** Elapsed share of the shared turn clock, 0..1. */
  progress?: number;
  /** The avatar's diameter. */
  size: number;
  /** Inset the fill to preserve the avatar's border. */
  borderWidth: number;
  children: ReactNode;
}

/** Native counterpart of the CSS fill; owns no animation or clock. */
export function SeatBeamCanvas({ active, size, borderWidth, progress, children }: SeatBeamProps) {
  const id = useId();
  if (!active || progress === undefined) return <>{children}</>;
  const centre = size / 2;
  const radius = Math.max(0, centre - borderWidth);
  const angle = Math.min(1, progress) * Math.PI * 2;
  const x = centre + radius * Math.sin(angle);
  const y = centre - radius * Math.cos(angle);
  const circumference = Math.PI * 2 * radius;
  return (
    <View style={{ width: size, height: size }}>
      {children}
      <Svg pointerEvents="none" width={size} height={size} style={[StyleSheet.absoluteFill, { overflow: "visible" }]}>
        <Defs>
          <LinearGradient id={`${id}-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="#ff9bdb" stopOpacity={0.7} />
            <Stop offset="0.45" stopColor="#ff239e" stopOpacity={0.65} />
            <Stop offset="1" stopColor="#b90970" stopOpacity={0.8} />
          </LinearGradient>
          <LinearGradient id={`${id}-rim`} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor="#ffd0ee" />
            <Stop offset="0.3" stopColor="#ff59ba" />
            <Stop offset="1" stopColor="#d20c83" />
          </LinearGradient>
        </Defs>
        {progress <= 0 ? null : progress >= 1 ? (
          <Circle cx={centre} cy={centre} r={radius} fill={`url(#${id}-fill)`} testID="seat-timer-full" />
        ) : (
          <Path
            d={`M ${centre} ${centre} L ${centre} ${centre - radius} A ${radius} ${radius} 0 ${progress > 0.5 ? 1 : 0} 1 ${x} ${y} Z`}
            fill={`url(#${id}-fill)`}
            testID="seat-timer-fill"
          />
        )}
        <Circle cx={centre} cy={centre} r={radius} fill="none" stroke="#741347" strokeWidth={7 * size / 68} />
        {[5, 1].map((width, index) => (
          <Circle key={width} cx={centre} cy={centre} r={radius} fill="none"
            stroke={index === 0 ? `url(#${id}-rim)` : "#ffe1f3"}
            strokeOpacity={index === 0 ? 1 : 0.65}
            strokeLinecap="round"
            strokeWidth={width * size / 68}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, progress)))}
            transform={`rotate(-90 ${centre} ${centre})`} />
        ))}
      </Svg>
    </View>
  );
}
