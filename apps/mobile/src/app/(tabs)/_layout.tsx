import { LinearGradient } from "expo-linear-gradient";
import { router, Tabs } from "expo-router";
import { useEffect, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import { ChipSprite, type ChipSpriteTone } from "@/components/chip/chip-sprite";
import { useReduceMotion } from "@/components/hud/use-reduce-motion";
import { LedgerStage } from "@/components/screens/history/ledger/ledger-stage";
import { ShadowBox } from "@/components/ui/shadow-box";
import { fonts } from "@/constants/theme";
import { coinStoreEnabled } from "@/lib/coin-store";
import { webTestID } from "@/lib/web-id";

const CHIP = 60;
// The rack height, and how far its chips rise over the scene above.
const RACK = 128;
const RACK_OVERLAP = 42;
// A short phone (iPhone SE, 667pt) shrinks the rack so the menu above it still fits.
const SHORT = 700;
const SHORT_SCALE = 0.8;
const CREAM = "#f7e7b5";
const TABS = {
  index: { label: "Home", tone: "red", color: "#a82118", suit: "♠" },
  friends: { label: "Friends", tone: "blue", color: "#164a9c", suit: "♥" },
  history: { label: "History", tone: "green", color: "#166135", suit: "♣" },
} satisfies Record<string, { label: string; tone: ChipSpriteTone; color: string; suit: string }>;
const GLOW = [
  { dy: 4, blur: 10, color: "rgba(0,0,0,0.6)" },
  { dy: 0, blur: 16, color: "rgba(247,215,122,0.45)" },
];

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
        // The shared atlas has no black row yet (STO-597); keep this fallback local to Store.
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

type TabLayoutProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["layout"]>>[0];

const NavRack = ({ state, descriptors, navigation }: Omit<TabLayoutProps, "children">) => {
  // Navigator layout's helpers omit the tab event map in their public type.
  // The runtime emitter is the same one supplied to a standard tabBar.
  const emit = navigation.emit as Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0]["navigation"]["emit"];
  const insets = useSafeAreaInsets();
  const storeEnabled = coinStoreEnabled();
  const k = useWindowDimensions().height < SHORT ? SHORT_SCALE : 1;
  return (
    <View style={[styles.rack, { height: RACK * k + insets.bottom }]}>
      <LinearGradient colors={["#b77a42", "#82451e", "#6a3619"]} locations={[0, 0.28, 1]} style={[StyleSheet.absoluteFill, styles.tray]} />
      <View style={styles.tabs}>
        {state.routes.map((route, index) => {
          if (!(route.name in TABS)) return null;
          const tab = TABS[route.name as keyof typeof TABS];
          const selected = state.index === index;
          const badge = descriptors[route.key].options.tabBarBadge;
          const testID = "tab-" + (route.name === "index" ? "home" : route.name);
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              testID={testID}
              id={webTestID(testID)}
              onPress={() => {
                const event = emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <Chip {...tab} k={k} selected={selected} />
              {badge != null ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
              <Text maxFontSizeMultiplier={1.2} style={[styles.label, k !== 1 && styles.labelShort, selected && styles.selectedLabel]}>{tab.label.toUpperCase()}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={storeEnabled ? "Store" : "Store, coming soon"}
          accessibilityState={{ disabled: !storeEnabled }}
          disabled={!storeEnabled}
          onPress={() => router.push("/store")}
          testID="tab-store"
          id={webTestID("tab-store")}
          style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
        >
          <Chip color="#29251e" suit="♦" k={k} />
          <Text maxFontSizeMultiplier={1.2} style={[styles.label, k !== 1 && styles.labelShort,!storeEnabled && styles.disabledLabel]}>STORE</Text>
        </Pressable>
      </View>
    </View>
  );
};

// Render descriptors ourselves so the Home scene stays visible and mounted during
// History transitions. Inactive native tab screens would hide the street beneath it.
const TabScenes: NonNullable<ComponentProps<typeof Tabs>["layout"]> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const k = useWindowDimensions().height < SHORT ? SHORT_SCALE : 1;
  const sceneBottom = RACK * k + insets.bottom - RACK_OVERLAP;
  const active = state.routes[state.index].name;
  const home = state.routes.find((route) => route.name === "index");
  const history = state.routes.find((route) => route.name === "history");
  return (
    <View style={styles.root}>
      <LedgerStage open={active === "history"} home={<View pointerEvents={active === "index" ? "auto" : "none"} aria-hidden={active !== "index"} accessibilityElementsHidden={active !== "index"} importantForAccessibility={active === "index" ? "auto" : "no-hide-descendants"} style={{ flex: 1, marginBottom: sceneBottom }}>{home ? descriptors[home.key].render() : null}</View>}>
        {history ? descriptors[history.key].render() : null}
      </LedgerStage>
      {state.routes.filter((route) => route.name !== "index" && route.name !== "history").map((route) => (
        <View key={route.key} pointerEvents={active === route.name ? "auto" : "none"} style={[StyleSheet.absoluteFill, { bottom: sceneBottom, display: active === route.name ? "flex" : "none" }]}>
          {route.name === "friends" || active === route.name ? descriptors[route.key].render() : null}
        </View>
      ))}
      <NavRack state={state} descriptors={descriptors} navigation={navigation} />
    </View>
  );
};

export default function TabLayout() {
  return (
    <Tabs backBehavior="initialRoute" layout={(props) => <TabScenes {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="friends" options={{ title: "Friends" }} />
      <Tabs.Screen name="history" options={{ title: "Game History" }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Overlap the scene while keeping the whole chip inside the native touchable bounds.
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
