import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import { ChipSprite, type ChipSpriteTone } from "@/components/chip/chip-sprite";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { ShadowBox } from "@/components/ui/shadow-box";
import { fonts } from "@/constants/theme";
import { coinStoreEnabled } from "@/lib/wallet/coin-store";
import { webTestID } from "@/lib/ui/web-id";

const CHIP = 60;
export const HOME_NAV_RACK_HEIGHT = 100;
export const HOME_NAV_RACK_OVERLAP = 42;
export const HOME_NAV_SHORT_HEIGHT = 700;
export const HOME_NAV_SHORT_SCALE = 0.8;
const CREAM = "#f7e7b5";
const GLOW = [
  { dy: 4, blur: 10, color: "rgba(0,0,0,0.6)" },
  { dy: 0, blur: 16, color: "rgba(247,215,122,0.45)" },
];

export type HomeNavDestination = "home" | "friends" | "history" | "store";

const TABS = {
  home: { label: "Home", tone: "red", color: "#a82118", suit: "♠" },
  friends: { label: "Friends", tone: "blue", color: "#164a9c", suit: "♥" },
  history: { label: "History", tone: "green", color: "#166135", suit: "♣" },
} satisfies Record<Exclude<HomeNavDestination, "store">, { label: string; tone: ChipSpriteTone; color: string; suit: string }>;

const ORDER: readonly HomeNavDestination[] = ["home", "friends", "history", "store"];

export interface HomeNavRackProps {
  active?: HomeNavDestination | null;
  friendsBadge?: number | string;
  onNavigate: (destination: HomeNavDestination) => void;
  onLongPress?: (destination: HomeNavDestination) => void;
}

function Chip({ tone, color, suit, selected = false, k = 1 }: {
  tone?: ChipSpriteTone;
  color: string;
  suit: string;
  selected?: boolean;
  k?: number;
}) {
  const size = CHIP * k;
  const reduced = useReduceMotion();
  const lift = useSharedValue(selected ? -14 : 0);
  useEffect(() => {
    lift.value = withTiming(selected ? -14 : 0, { duration: reduced ? 0 : 500, easing: Easing.bezier(.3, 1.4, .5, 1) });
  }, [selected, reduced, lift]);
  const motion = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.chip, { width: size, height: size }, motion]}>
      {selected ? <ShadowBox radius={size / 2} shadows={GLOW} /> : null}
      {tone ? <ChipSprite tone={tone} pose="face" size={size} /> : (
        <Svg width={size} height={size} viewBox="0 0 60 60">
          <Circle cx={30} cy={30} r={29} fill={color} stroke="#17130e" strokeWidth={2} />
          <Circle cx={30} cy={30} r={24} fill="none" stroke={CREAM} strokeWidth={9} strokeDasharray={[9.42, 9.42]} />
        </Svg>
      )}
      <View style={[styles.suitDisc, { backgroundColor: color, transform: [{ scale: k }] }]}>
        <Svg width={28} height={28} viewBox="0 0 28 28">
          <SvgText x={14} y={22} fontSize={24} fill={CREAM} textAnchor="middle">{suit}</SvgText>
        </Svg>
      </View>
    </Animated.View>
  );
}

export function HomeNavRack({ active = null, friendsBadge, onNavigate, onLongPress }: HomeNavRackProps) {
  const insets = useSafeAreaInsets();
  const storeEnabled = coinStoreEnabled();
  const k = useWindowDimensions().height < HOME_NAV_SHORT_HEIGHT ? HOME_NAV_SHORT_SCALE : 1;

  return (
    <View style={[styles.rack, { height: HOME_NAV_RACK_HEIGHT * k + insets.bottom }]} testID="home-nav-rack">
      <LinearGradient colors={["#b77a42", "#82451e", "#6a3619"]} locations={[0, 0.28, 1]} style={[StyleSheet.absoluteFill, styles.tray]} />
      <View style={styles.tabs}>
        {ORDER.map((destination) => {
          const store = destination === "store";
          const tab = store ? { label: "Store", color: "#29251e", suit: "♦" } : TABS[destination];
          const selected = active === destination;
          const disabled = store && !storeEnabled;
          const badge = destination === "friends" ? friendsBadge : undefined;
          const testID = `tab-${destination}`;
          return (
            <Pressable
              key={destination}
              accessibilityRole={store ? "button" : "tab"}
              accessibilityLabel={store && disabled ? "Store, coming soon" : tab.label}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              testID={testID}
              id={webTestID(testID)}
              onPress={() => onNavigate(destination)}
              onLongPress={() => onLongPress?.(destination)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <Chip {...tab} k={k} selected={selected} />
              {badge == null ? null : <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
              <Text maxFontSizeMultiplier={1.2} style={[styles.label, k !== 1 && styles.labelShort, selected && styles.selectedLabel, disabled && styles.disabledLabel]}>{tab.label.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rack: { position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 },
  tray: { top: 42, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTopWidth: 2, borderColor: "#d6a56a" },
  tabs: { position: "absolute", top: 0, left: 16, right: 16, flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", paddingTop: 6, minHeight: 84 },
  labelShort: { fontSize: 11, marginTop: 4 },
  pressed: { transform: [{ translateY: 4 }], opacity: 0.8 },
  chip: { width: CHIP, height: CHIP },
  suitDisc: { position: "absolute", width: 29, height: 29, left: 15.5, top: 15.5, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.arcade, fontSize: 13, color: "#2a1206", marginTop: 10 },
  selectedLabel: { color: "#ffe6a6" },
  disabledLabel: { color: "#4b301e" },
  badge: { position: "absolute", top: 0, right: 6, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: "#f4c75d", borderWidth: 1, borderColor: "#704015", alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.arcade, fontSize: 12, color: "#302315" },
});
