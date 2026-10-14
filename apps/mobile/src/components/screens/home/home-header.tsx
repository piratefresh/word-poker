import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";
import { formatCoins } from "@/lib/format";
import { useQuests } from "@/lib/quests-provider";
import { levelForXp } from "@wordpoker/game-rules";

import { AccountMenu } from "./account-menu";
import { AccountSettings } from "./account-settings";
import { LevelRing } from "./level-ring";

export function HomeHeader({ width }: { width: number }) {
  const { data: session } = authClient.useSession();
  const { coins, state } = useQuests();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const name = session?.user.isAnonymous
    ? "Guest"
    : (session?.user.name?.trim() || session?.user.email || "Player");
  const standing = state ? levelForXp(state.xp) : null;

  const signOut = async () => {
    setSignOutError(false);
    try {
      const result = await authClient.signOut();
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
            <Text style={styles.initial}>{name.charAt(0).toUpperCase()}</Text>
            <View style={styles.chevron}><Text style={styles.chevronText}>⌄</Text></View>
          </View>
        </AccountMenu>
        <View style={styles.stats}>
          <View accessibilityLabel={coins == null ? "Credits unavailable" : `${coins} credits`} accessible style={styles.credits} testID="home-credits">
            <Text style={styles.caption}>Credits</Text>
            <Text style={styles.amount}>{coins == null ? "—" : formatCoins(coins)}</Text>
          </View>
          {standing ? <LevelRing {...standing} /> : null}
        </View>
      </View>
      {signOutError ? <Text accessibilityRole="alert" style={styles.error}>Couldn’t sign out. Try again from the account menu.</Text> : null}
      {settingsOpen ? <AccountSettings onDismiss={() => setSettingsOpen(false)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 56 },
  avatar: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  initial: { color: colors.onGold, fontFamily: fonts.ui, fontSize: fontSize.h3 },
  chevron: { position: "absolute", bottom: -1, right: -3, width: 18, height: 18, borderRadius: radius.pill, backgroundColor: colors.bgElevated, borderColor: colors.borderStrong, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  chevronText: { color: colors.goldHi, fontSize: fontSize.small, lineHeight: 14 },
  stats: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  credits: { alignItems: "flex-end" },
  caption: { color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.caption },
  amount: { color: colors.goldHi, fontFamily: fonts.ui, fontSize: fontSize.title },
  error: { color: colors.danger, fontFamily: fonts.sans, fontSize: fontSize.small, marginTop: spacing.sm },
});
