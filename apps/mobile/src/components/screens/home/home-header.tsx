import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { authClient } from "@/auth/client/auth-client";
import { changeSession, setAutoRestore } from "@/auth/client/session-coordinator";
import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";
import { coinStoreEnabled } from "@/lib/wallet/coin-store";
import { formatCoins } from "@/lib/ui/format";
import { unregisterPush } from "@/lib/friends/use-push-registration";
import { useQuests } from "@/lib/quests/quests-provider";
import { levelForXp } from "@wordpoker/game-rules";

import { AccountMenu } from "./account-menu";
import { AccountSettings } from "./account-settings";

/** Where the top bar sits in a scene of `height` (the street, or a tab drawn over it like the store). */
export function homeHeaderTop(insetTop: number, height: number): number {
  return Math.max(insetTop + spacing.sm, height >= 700 ? 54 : 20);
}

/** A short scale bump whenever the balance moves (STO-1045); none on the first read. */
function useCoinBump(coins: number | null) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const last = useRef(coins);

  useEffect(() => {
    const before = last.current;
    last.current = coins;
    if (reduceMotion || before == null || coins == null || before === coins) return;
    scale.set(withSequence(withTiming(1.12, { duration: 120 }), withTiming(1, { duration: 160 })));
  }, [coins, reduceMotion, scale]);

  return useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
}

/** The street menu's top bar (STO-597): a gold avatar on the left, level and coin pills on the right. */
export function HomeHeader({ width }: { width: number }) {
  const { data: session } = authClient.useSession();
  const { coins, state } = useQuests();
  const bump = useCoinBump(coins);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const name = session?.user.isAnonymous
    ? "Guest"
    : (session?.user.name?.trim() || session?.user.email || "Player");
  const standing = state ? levelForXp(state.xp) : null;

  const signOut = async () => {
    setSignOutError(false);
    try {
      // Before the session goes: the API needs it to take this device's push token back (STO-585).
      await unregisterPush().catch(() => {});
      // Signing out means staying out: no Game Center / Play Games restore on the next launch.
      await setAutoRestore(false);
      const result = await changeSession(() => authClient.signOut());
      if (result.error) setSignOutError(true);
    } catch {
      setSignOutError(true);
    }
  };

  return (
    <View style={{ width }}>
      <View style={styles.header} testID="home-header">
        <AccountMenu name={name} onSettings={() => setSettingsOpen(true)} onSignOut={signOut}>
          <View accessibilityLabel={`Avatar for ${name}`} accessibilityRole="image" accessible style={styles.avatar}>
            {session?.user.image ? (
              <Image contentFit="cover" source={{ uri: session.user.image }} style={StyleSheet.absoluteFill} />
            ) : (
              <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
            )}
          </View>
        </AccountMenu>
        <View style={styles.stats}>
          {standing ? (
            // Quests and the Store ride behind the Coin Store's flag; until then the pills only read out.
            <Pressable
              accessibilityLabel={`Level ${standing.level}, ${standing.intoLevel} of ${standing.intoLevel + standing.toNext} XP`}
              accessibilityRole={coinStoreEnabled() ? "button" : "text"}
              disabled={!coinStoreEnabled()}
              onPress={() => router.push("/quests")}
              style={styles.pill}
              testID="home-level"
            >
              <Text style={styles.pillText}>{`LV ${standing.level}`}</Text>
            </Pressable>
          ) : null}
          <Animated.View style={[styles.coinPill, bump]}>
          <Pressable
            accessibilityLabel={coins == null ? "Wallet unavailable" : `Wallet, ${formatCoins(coins)} coins`}
            accessibilityRole={coinStoreEnabled() ? "button" : "text"}
            disabled={!coinStoreEnabled()}
            onPress={() => router.push("/store")}
            style={styles.pill}
            testID="home-credits"
          >
            <View style={styles.coin} />
            <Text style={styles.pillText}>{coins == null ? "—" : formatCoins(coins)}</Text>
          </Pressable>
          </Animated.View>
        </View>
      </View>
      {signOutError ? <Text accessibilityRole="alert" style={styles.error}>Couldn’t sign out. Try again from the account menu.</Text> : null}
      {settingsOpen ? <AccountSettings onDismiss={() => setSettingsOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  // The lip is the darker bottom border: the face sits on it, as the slabs below do.
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: "#d4a24c",
    borderColor: "#e0974a",
    borderWidth: 1.5,
    borderBottomWidth: 4,
    borderBottomColor: "#8f5f22",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initial: { color: "#3a2410", fontFamily: fonts.arcade, fontSize: 22 },
  stats: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1, marginLeft: spacing.sm },
  coinPill: { flexShrink: 1 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 44,
    flexShrink: 1,
    borderRadius: radius.pill,
    backgroundColor: "rgba(8, 12, 28, 0.7)",
    borderColor: "#e0974a",
    borderWidth: 3,
  },
  pillText: { color: "#f7e7b5", fontFamily: fonts.arcade, fontSize: 17 },
  coin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#d4a24c",
    borderColor: "#f7df7a",
    borderWidth: 2,
  },
  error: { color: colors.danger, fontFamily: fonts.sans, fontSize: fontSize.small, marginTop: spacing.sm },
});
