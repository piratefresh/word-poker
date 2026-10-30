/**
 * home-screen.tsx — the street menu (STO-595, STO-597): a dusk street with a lit club door, the
 * tile logo, and the mode slabs stacked on the wall to the left of the door.
 *
 * Choosing a mode walks through the door: the UI fades, the street zooms toward the doorway and
 * the warm interior colour fills the screen, then the mode's screen opens. Coming back resets it.
 *
 * ponytail: the zoom runs on the one flat background, so the door doesn't swing and the sky
 * doesn't parallax. Swap in STO-596's layers (door rotated about its hinge, sky slower than the
 * wall, light spill) and STO-598's 2.4s beat timing once the art lands.
 */

import { Host } from "@expo/ui";
import { isAccountEligible } from "@wordpoker/contracts";
import { Image } from "expo-image";
import { useNetworkState } from "expo-network";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authClient } from "@/auth/client/auth-client";
import {
  MenuSlab,
  type MenuSlabProps,
} from "@/components/screens/home/components/menu-slab";
import type { ModeVariant } from "@/components/screens/home/components/mode-variants";
import { OfflineTray } from "@/components/screens/home/components/offline-tray";
import { HomeHeader } from "@/components/screens/home/home-header";
import { artPoint, STREETS } from "@/components/screens/home/street-art";
import { LEDGER_CLOSE_MS } from "@/components/screens/history/ledger/ledger-stage";
import { StreetLogo } from "@/components/screens/home/street-logo";
import { ParlorBackground } from "@/components/screens/lobby/parlor-background";
import { VerifyEmailCard } from "@/components/ui/verify-email-card";
import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";
import { readItem, TUTORIAL_DONE } from "@/lib/storage/claim-store";
import { formatCoins } from "@/lib/ui/format";
import { useQuests } from "@/lib/quests/quests-provider";

const WALL_PAD = 12;
/**
 * The interior's warm wood, which fills the screen at the threshold.
 * ponytail: eyeballed from the door's light; STO-596 picks the real one from the table art.
 */
const INTERIOR = "#c98a4b";
const ENTER_MS = 900;
const ENTER_ZOOM = 3.4;
const SKY_RISE_MS = 1_100;
const LOGO_MAX_WIDTH = 280;

type Variant = ModeVariant & { params?: { powers: "wild" } };

const OFFLINE_VARIANTS: readonly [Variant, ...Variant[]] = [
  {
    key: "normal",
    label: "Normal",
    description: "Standard rules",
    testID: "offline-normal",
  },
  {
    key: "wild",
    // The table's power-ups switch (STO-484): the offline adapter reads it off the route.
    params: { powers: "wild" },
    label: "Wild Power",
    description: "Pick a power each hand",
    testID: "offline-wild",
  },
];

type Slab = Pick<
  MenuSlabProps,
  "label" | "letter" | "tone" | "tag" | "width" | "tilt"
> & {
  key: string;
  /** The mode's screen; Offline has none of its own and opens its choices instead. */
  href?: Href;
  /** Needs the server, so it greys out when the device is offline. */
  online?: true;
};

/** Widest first, and each stays left of the doorway on a 375-point phone. */
const SLABS: readonly Slab[] = [
  {
    key: "online",
    label: "Play Online",
    letter: "O",
    tone: "gold",
    width: 204,
    tilt: -0.8,
    href: "/online",
    online: true,
  },
  // The lobby opens its create sheet; the dealt table carries the invite (STO-581).
  {
    key: "friend",
    label: "Play a Friend",
    letter: "P",
    width: 190,
    tilt: 0.8,
    href: { pathname: "/online", params: { create: "1" } },
    online: true,
  },
  {
    key: "tutorial",
    label: "Tutorial",
    letter: "T",
    tag: "+100",
    width: 176,
    tilt: -0.8,
    href: "/tutorial",
  },
  { key: "offline", label: "Offline", letter: "B", width: 164, tilt: 0.8 },
];
const SLAB_MAX_WIDTH = Math.max(...SLABS.map((slab) => slab.width));

export function HomeScreen() {
  const { data: session } = authClient.useSession();
  const { streakBanner, dismissStreakBanner, levelUp, dismissLevelUp } =
    useQuests();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [box, setBox] = useState({ width: windowWidth, height: windowHeight });
  const { offline: requestedOffline } = useLocalSearchParams<{ offline?: string }>();
  const [offlineOpen, setOfflineOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(48);
  const closeOffline = useCallback(() => setOfflineOpen(false), []);
  // First launch: the Tutorial slab stands out until the guided hand has been played through.
  const [tutorialDone, setTutorialDone] = useState(
    () => readItem(TUTORIAL_DONE) !== null,
  );
  // Unknown until the first read, so the slabs start enabled.
  const offline = useNetworkState().isConnected === false;
  const contentWidth = windowWidth - spacing.gutter * 2;

  /** 0 on the street, 1 through the door. */
  const enter = useSharedValue(0);
  /** 0 on the street, 1 in the night sky lobby. */
  const skyRise = useSharedValue(0);
  const leaving = useRef(false);

  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      enter.set(0);
      skyRise.set(0);
      setTutorialDone(readItem(TUTORIAL_DONE) !== null);
      return () => setOfflineOpen(false);
    }, [enter, skyRise]),
  );

  // Reveal the tray after the book finishes closing over the street.
  useFocusEffect(useCallback(() => {
    if (requestedOffline !== "1") return;
    const timer = setTimeout(() => {
      setOfflineOpen(true);
      router.setParams({ offline: undefined });
    }, reduceMotion ? 0 : LEDGER_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [requestedOffline, reduceMotion]));

  const go = (href: Href, riseToSky = false) => {
    if (leaving.current) return;
    setOfflineOpen(false);
    if (reduceMotion) {
      router.push(href);
      return;
    }
    leaving.current = true;
    if (riseToSky) {
      skyRise.set(withTiming(1, { duration: SKY_RISE_MS, easing: Easing.inOut(Easing.cubic) }));
      setTimeout(() => router.push(href), SKY_RISE_MS);
      return;
    }
    enter.set(
      withTiming(1, { duration: ENTER_MS, easing: Easing.in(Easing.cubic) }),
    );
    setTimeout(() => router.push(href), ENTER_MS);
  };

  const street = box.width > box.height ? STREETS.landscape : STREETS.portrait;
  // Continue the art behind the rack so its doorway keeps the full-screen proportions.
  const artBox = {
    width: box.width,
    height: Math.max(box.height, windowHeight - insets.top),
  };
  const door = artPoint(street, artBox, street.door);
  const wallY = artPoint(street, artBox, { x: 0, y: street.wallTop }).y;
  // A wide wall centres the stack left of the door; a phone's is too narrow, so it stays on the edge.
  const doorLeft = artPoint(street, artBox, { x: street.doorLeft, y: 0 }).x;
  const slabsX =
    box.width > box.height ? Math.max(0, (doorLeft - SLAB_MAX_WIDTH) / 2) : 0;
  const zoom = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(enter.get(), [0, 1], [1, ENTER_ZOOM]) }],
  }));
  const skyStreet = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(skyRise.get(), [0, 1], [0, box.height * 0.78]) },
      { scale: interpolate(skyRise.get(), [0, 1], [1, 1.38]) },
    ],
  }));
  const skyReveal = useAnimatedStyle(() => ({
    opacity: interpolate(skyRise.get(), [0, 0.25, 1], [0, 0.2, 1], "clamp"),
    transform: [{ scale: interpolate(skyRise.get(), [0, 1], [1.04, 1]) }],
  }));
  const uiFade = useAnimatedStyle(() => ({
    opacity:
      interpolate(enter.get(), [0, 0.3], [1, 0], "clamp") *
      interpolate(skyRise.get(), [0, 0.5, 1], [1, 0.25, 0], "clamp"),
    transform: [{ translateY: interpolate(skyRise.get(), [0, 1], [0, 28]) }],
  }));
  const warm = useAnimatedStyle(() => ({
    opacity: interpolate(enter.get(), [0.5, 1], [0, 1], "clamp"),
  }));

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) =>
    setBox({
      width: nativeEvent.layout.width,
      height: nativeEvent.layout.height,
    });

  const headerTop = Math.max(insets.top + spacing.sm, box.height >= 700 ? 54 : 20);

  return (
    <View onLayout={onLayout} style={styles.root}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { bottom: undefined, height: artBox.height },
          { transformOrigin: [door.x, door.y, 0] },
          zoom,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, skyStreet]}>
          <Image contentFit="cover" source={street.source} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </Animated.View>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, skyReveal]}>
        <ParlorBackground />
      </Animated.View>

      <Animated.View
        aria-hidden={offlineOpen}
        accessibilityElementsHidden={offlineOpen}
        importantForAccessibility={offlineOpen ? "no-hide-descendants" : "auto"}
        style={[styles.fill, uiFade]}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View
            style={[
              styles.menuTop,
              {
                minHeight: wallY + WALL_PAD,
                paddingTop: headerTop,
              },
            ]}
          >
            <View style={{ height: headerHeight }} />

            <View style={[styles.gutter, styles.logo]}>
              <StreetLogo width={Math.min(contentWidth, LOGO_MAX_WIDTH)} />
            </View>

            {/* A guest's placeholder address can't be verified; they make an account to claim one. A
              Game Center account is already eligible and its placeholder is never shown. */}
            {session?.user &&
            !isAccountEligible(session.user) &&
            !session.user.isAnonymous ? (
              <View style={styles.gutter}>
                <Host
                  colorScheme="dark"
                  matchContents={{ vertical: true }}
                  seedColor={colors.gold}
                  style={{ width: contentWidth }}
                >
                  <VerifyEmailCard
                    email={session.user.email}
                    testID="home-verify"
                  />
                </Host>
              </View>
            ) : null}

            {streakBanner ? (
              <Banner
                onPress={dismissStreakBanner}
                testID="quest-streak-banner"
                text={`DAY ${streakBanner.day} STREAK · +${formatCoins(streakBanner.reward)} COINS`}
              />
            ) : null}

            {levelUp ? (
              <Banner
                onPress={dismissLevelUp}
                testID="level-up-banner"
                text={`LEVEL ${levelUp.level} REACHED · +${formatCoins(levelUp.reward)} COINS`}
              />
            ) : null}
          </View>

          {/* A short phone (375×667) closes the stack up so Offline clears the rack. */}
          <View style={[styles.slabs, { marginLeft: slabsX, gap: box.height < 700 ? 8 : 14 }]}>
            {SLABS.map(({ key, href, online, ...slab }) => (
              <MenuSlab
                key={key}
                {...slab}
                attached={slabsX === 0}
                disabled={online && offline ? "Offline" : undefined}
                highlight={key === "tutorial" && !tutorialDone}
                onPress={() =>
                  href ? go(href, online === true) : setOfflineOpen((open) => !open)
                }
                testID={`home-slab-${key}`}
              />
            ))}
          </View>
        </ScrollView>
      </Animated.View>

      {offlineOpen ? (
        <OfflineTray
          variants={OFFLINE_VARIANTS}
          onClose={closeOffline}
          onDeal={(variant, chips) => go({ pathname: "/offline", params: { ...variant.params, chips } })}
          maxHeight={Math.max(180, box.height - headerTop - headerHeight - 88)}
        />
      ) : null}

      <Animated.View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[styles.header, { top: headerTop }, uiFade]}
      >
        <HomeHeader width={contentWidth} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.interior, warm]}
      />
    </View>
  );
}

function Banner({
  text,
  onPress,
  testID,
}: {
  text: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.banner}
      testID={testID}
    >
      <Text style={styles.bannerText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Visible so the street art (sized to the window) runs on behind the nav rack.
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingBottom: spacing.lg },
  menuTop: { gap: spacing.md, paddingBottom: spacing.md },
  gutter: { paddingHorizontal: spacing.gutter },
  logo: { alignItems: "center" },
  slabs: { alignItems: "flex-start" },
  header: { position: "absolute", left: spacing.gutter, right: spacing.gutter },
  banner: {
    marginHorizontal: spacing.gutter,
    backgroundColor: colors.goldDeep,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  bannerText: {
    color: colors.goldHi,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.small,
    letterSpacing: 1.2,
  },
  interior: { backgroundColor: INTERIOR },
});
