import { LegendList, type LegendListProps } from "@legendapp/list/react-native";
import { useId, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { gradients, radius, spacing } from "@/constants/theme";
import { ledgerListAccessibilityProps } from "./ledger-list-accessibility";

/** Fixed felt; tinted text belongs below 35% of the viewport or inside a panel/card. */
function LedgerFelt({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const id = useId().replace(/:/g, "");
  const [size, setSize] = useState({ width: 375, height: 812 });
  const horizontalFade = Math.min(.5, 60 / Math.max(1, size.width));
  const verticalFade = Math.min(.5, 60 / Math.max(1, size.height));
  return (
    <View style={[styles.page, style]} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${id}felt`} gradientUnits="userSpaceOnUse" cx={0} cy={0} fx={0} fy={0} r={1}
            gradientTransform={`translate(${size.width / 2},0) scale(${size.width * 1.3},${size.height * .7})`}>
            {gradients.table.colors.map((color, i) => <Stop key={color} offset={i / 2} stopColor={color} />)}
          </RadialGradient>
          <LinearGradient id={`${id}spine`}>
            {/* Native SVG gradients take alpha from stopOpacity, ignoring the color's alpha. */}
            <Stop stopColor="#000" stopOpacity={.35} /><Stop offset="1" stopColor="#000" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}horizontal`}>
            <Stop stopColor="#020a07" stopOpacity={.7} /><Stop offset={horizontalFade} stopColor="#020a07" stopOpacity={0} /><Stop offset={1 - horizontalFade} stopColor="#020a07" stopOpacity={0} /><Stop offset="1" stopColor="#020a07" stopOpacity={.7} />
          </LinearGradient>
          <LinearGradient id={`${id}vertical`} x2="0%" y2="100%">
            <Stop stopColor="#020a07" stopOpacity={.7} /><Stop offset={verticalFade} stopColor="#020a07" stopOpacity={0} /><Stop offset={1 - verticalFade} stopColor="#020a07" stopOpacity={0} /><Stop offset="1" stopColor="#020a07" stopOpacity={.7} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}felt)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}horizontal)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}vertical)`} />
        <Rect width="14" height="100%" fill={`url(#${id}spine)`} />
      </Svg>
      {children}
    </View>
  );
}

export function LedgerPage({ children, gap = 10, style, contentContainerStyle, ...props }: ScrollViewProps & { gap?: number }) {
  return (
    <LedgerFelt style={style}>
      <ScrollView {...props} contentContainerStyle={[styles.content, { gap }, contentContainerStyle]}>
        {children}
      </ScrollView>
    </LedgerFelt>
  );
}

/** Virtualized page for long histories. List items are absolutely positioned, so rows add their own bottom gap. */
export function LedgerList<T>({ style, contentContainerStyle, accessibilityLabel, ...props }: LegendListProps<T>) {
  return (
    <LedgerFelt style={style as StyleProp<ViewStyle>}>
      <LegendList<T>
        {...props}
        {...(ledgerListAccessibilityProps(accessibilityLabel) as Partial<LegendListProps<T>>)}
        contentContainerStyle={[styles.content, contentContainerStyle]}
      />
    </LedgerFelt>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: "hidden", backgroundColor: gradients.table.colors[2], borderTopLeftRadius: radius.xs, borderBottomLeftRadius: radius.xs, borderTopRightRadius: radius.md, borderBottomRightRadius: radius.md },
  content: { paddingTop: 60, paddingHorizontal: 14 + spacing.sm, paddingBottom: 150 },
});
