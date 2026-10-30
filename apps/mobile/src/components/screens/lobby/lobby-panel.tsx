/**
 * lobby-panel.tsx — design 1a Flow B's panel above the table list: the ways back for a Wallet below
 * the cheapest table, and the account pitch for a guest, who has no Wallet at all.
 */

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { WELCOME_GRANT } from "@wordpoker/contracts";

import { border, fonts, fontSize, nightLobby, opacity, spacing } from "@/constants/theme";
import { formatCoins } from "@/lib/ui/format";
import { NightLobbyButton } from "./night-lobby-button";

/** Home opens its offline tray on this param — the free game against bots. */
const PRACTICE = { pathname: "/", params: { offline: "1" } } as const;

function Panel({ eyebrow, title, body, children, testID }: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
  testID: string;
}): ReactElement {
  return (
    <View style={styles.panel} testID={testID}>
      <LinearGradient colors={nightLobby.panel.raised} style={StyleSheet.absoluteFill} />
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {children}
    </View>
  );
}

function Tile({ title, line, onPress, testID }: { title: string; line: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      accessibilityLabel={`${title}. ${line}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      testID={testID}
    >
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileLine}>{line}</Text>
    </Pressable>
  );
}

/** The Wallet is below `cheapest`: the store first, then quests and free practice. */
export function OutOfCoinsPanel({ cheapest }: { cheapest: number }): ReactElement {
  return (
    <Panel
      body="Here's how to get back to the tables. Practice games are free and always open."
      eyebrow={`ONLINE TABLES START AT ${formatCoins(cheapest)}`}
      testID="lobby-out-of-coins"
      title="OUT OF COINS"
    >
      <NightLobbyButton label="VISIT THE STORE" onPress={() => router.push("/store")} testID="lobby-out-of-coins-store" />
      <View style={styles.tiles}>
        <Tile line="Earn coins from quests" onPress={() => router.push("/quests")} testID="lobby-out-of-coins-quests" title="QUESTS" />
        <Tile line="Free game against bots" onPress={() => router.navigate(PRACTICE)} testID="lobby-out-of-coins-practice" title="PRACTICE" />
      </View>
    </Panel>
  );
}

/** A guest has no Wallet, so no table takes them; the panel sells the account by its welcome grant. */
export function GuestPanel(): ReactElement {
  return (
    <Panel
      body={`Online tables need a wallet. New accounts start with ${formatCoins(WELCOME_GRANT)} coins.`}
      eyebrow="PLAYING AS A GUEST"
      testID="lobby-guest"
      title="CREATE AN ACCOUNT TO PLAY ONLINE"
    >
      <NightLobbyButton label="CREATE ACCOUNT" onPress={() => router.push("/sign-up")} testID="lobby-guest-sign-up" />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.navigate(PRACTICE)}
        style={({ pressed }) => pressed && styles.pressed}
        testID="lobby-guest-practice"
      >
        <Text style={styles.link}>Keep playing bots for free</Text>
      </Pressable>
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderColor: "#e0974a",
    borderRadius: 20,
    borderWidth: border.thick,
    gap: spacing.sm,
    marginHorizontal: spacing.gutter,
    overflow: "hidden",
    padding: spacing.md,
  },
  eyebrow: { color: nightLobby.gold.light, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.caption, letterSpacing: 1.8 },
  title: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.h2, letterSpacing: 0.8 },
  body: { color: nightLobby.text.cream, fontFamily: fonts.rubik, fontSize: fontSize.body, paddingBottom: spacing.xs },
  tiles: { flexDirection: "row", gap: spacing.sm },
  tile: { borderColor: "#e0974a", borderRadius: 14, borderWidth: border.thick, flex: 1, gap: 2, padding: spacing.sm },
  tileTitle: { color: nightLobby.text.cream, fontFamily: fonts.arcade, fontSize: fontSize.body, letterSpacing: 0.4 },
  tileLine: { color: nightLobby.text.cream, fontFamily: fonts.rubikMedium, fontSize: fontSize.caption },
  link: { color: nightLobby.gold.light, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.body, textAlign: "center" },
  pressed: { opacity: opacity.pressed },
});
