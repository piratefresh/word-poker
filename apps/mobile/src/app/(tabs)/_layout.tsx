import { router, Tabs } from "expo-router";
import { type ComponentProps } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  HOME_NAV_RACK_HEIGHT,
  HOME_NAV_RACK_OVERLAP,
  HOME_NAV_SHORT_HEIGHT,
  HOME_NAV_SHORT_SCALE,
  HomeNavRack,
  type HomeNavDestination,
} from "@/components/screens/home/home-nav-rack";
import { LedgerStage } from "@/components/screens/history/ledger/ledger-stage";

type TabLayoutProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["layout"]>>[0];

const AppTabsNavRack = ({ state, descriptors, navigation }: Omit<TabLayoutProps, "children">) => {
  const emit = navigation.emit as Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0]["navigation"]["emit"];
  const currentName = state.routes[state.index].name;
  const active = currentName === "index" ? "home" : currentName === "friends" || currentName === "history" ? currentName : null;
  const friends = state.routes.find((route) => route.name === "friends");
  const friendsBadge = friends === undefined ? undefined : descriptors[friends.key].options.tabBarBadge;

  const navigate = (destination: HomeNavDestination) => {
    if (destination === "store") {
      router.push("/store");
      return;
    }
    const routeName = destination === "home" ? "index" : destination;
    const route = state.routes.find((item) => item.name === routeName);
    if (route === undefined) return;
    const selected = currentName === routeName;
    const event = emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
  };

  const longPress = (destination: HomeNavDestination) => {
    if (destination === "store") return;
    const routeName = destination === "home" ? "index" : destination;
    const route = state.routes.find((item) => item.name === routeName);
    if (route !== undefined) emit({ type: "tabLongPress", target: route.key });
  };

  return <HomeNavRack active={active} friendsBadge={friendsBadge} onLongPress={longPress} onNavigate={navigate} />;
};
// Render descriptors ourselves so the Home scene stays visible and mounted during
// History transitions. Inactive native tab screens would hide the street beneath it.
const TabScenes: NonNullable<ComponentProps<typeof Tabs>["layout"]> = ({ state, descriptors, navigation }) => {
  const insets = useSafeAreaInsets();
  const k = useWindowDimensions().height < HOME_NAV_SHORT_HEIGHT ? HOME_NAV_SHORT_SCALE : 1;
  const sceneBottom = HOME_NAV_RACK_HEIGHT * k + insets.bottom - HOME_NAV_RACK_OVERLAP;
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
      <AppTabsNavRack state={state} descriptors={descriptors} navigation={navigation} />
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
  // Keep offscreen tray and ledger animations from expanding the web document.
  root: { flex: 1, overflow: "hidden" },
});
