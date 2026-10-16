import { LinearGradient } from "expo-linear-gradient";
import { router, Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Text as SvgText } from "react-native-svg";

import { ChipSprite, type ChipSpriteTone } from "@/components/chip/chip-sprite";
import { ShadowBox } from "@/components/ui/shadow-box";
import { fonts } from "@/constants/theme";
import { coinStoreEnabled } from "@/lib/coin-store";
import { webTestID } from "@/lib/web-id";

const CHIP = 60;
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

function Chip({ tone, color, suit, selected = false }: {
  tone?: ChipSpriteTone;
  color: string;
  suit: string;
  selected?: boolean;
}) {
  return (
    <View pointerEvents="none" style={[styles.chip, selected && styles.lifted]}>
      {selected ? <ShadowBox radius={CHIP / 2} shadows={GLOW} /> : null}
      {tone ? <ChipSprite tone={tone} pose="face" size={CHIP} /> : (
        // The shared atlas has no black row yet (STO-597); keep this fallback local to Store.
        <Svg width={CHIP} height={CHIP} viewBox="0 0 60 60">
          <Circle cx={30} cy={30} r={29} fill={color} stroke="#17130e" strokeWidth={2} />
          <Circle cx={30} cy={30} r={24} fill="none" stroke={CREAM} strokeWidth={9} strokeDasharray={[9.42, 9.42]} />
        </Svg>
      )}
      <View style={[styles.suitDisc, { backgroundColor: color }]}>
        <Svg width={28} height={28} viewBox="0 0 28 28">
          <SvgText x={14} y={22} fontSize={24} fill={CREAM} textAnchor="middle">{suit}</SvgText>
        </Svg>
      </View>
    </View>
  );
}

const NavRack: NonNullable<ComponentProps<typeof Tabs>["tabBar"]> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const storeEnabled = coinStoreEnabled();
  return (
    <View style={[styles.rack, { height: 78 + insets.bottom }]}>
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
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <Chip {...tab} selected={selected} />
              {badge != null ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
              <Text maxFontSizeMultiplier={1.2} style={[styles.label, selected && styles.selectedLabel]}>{tab.label.toUpperCase()}</Text>
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
          <Chip color="#29251e" suit="♦" />
          <Text maxFontSizeMultiplier={1.2} style={[styles.label, !storeEnabled && styles.disabledLabel]}>STORE</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default function TabLayout() {
  return (
    <Tabs backBehavior="initialRoute" tabBar={NavRack} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="friends" options={{ title: "Friends" }} />
      <Tabs.Screen name="history" options={{ title: "Game History" }} />
      <Tabs.Screen name="explore" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  rack: { backgroundColor: "#6a3619", zIndex: 1 },
  tray: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderTopWidth: 2, borderColor: "#d6a56a" },
  tabs: { position: "absolute", top: -42, left: 16, right: 16, flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", paddingTop: 6, minHeight: 106 },
  pressed: { transform: [{ translateY: 4 }], opacity: 0.8 },
  chip: { width: CHIP, height: CHIP },
  lifted: { transform: [{ translateY: -12 }] },
  suitDisc: { position: "absolute", width: 29, height: 29, left: 15.5, top: 15.5, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.arcade, fontSize: 13, color: "#2d190c", marginTop: 10 },
  selectedLabel: { color: CREAM },
  disabledLabel: { color: "#4b301e" },
  badge: { position: "absolute", top: 0, right: 6, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: "#f4c75d", borderWidth: 1, borderColor: "#704015", alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: fonts.arcade, fontSize: 12, color: "#302315" },
});
