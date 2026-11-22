import { Link, router } from "expo-router";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";

import { GoldButton } from "@/components/ui/gold-button";
import { Trailer } from "@/components/ui/trailer";
import { TESTFLIGHT_URL } from "@/constants/links";
import { colors, fonts, fontSize, radius, spacing } from "@/constants/theme";

/**
 * `/beta`: the public page the TestFlight launch points people at — join the iOS beta, or make an
 * account and play in the browser. Outside the auth guards, like `/privacy`.
 */

const STEPS = [
  "Install TestFlight from the App Store.",
  "Tap “Join the iOS beta” on your iPhone or iPad.",
  "Sign in with the same account you use on the web — your coins and friends come along.",
] as const;

export default function BetaPage() {
  return (
    <ScrollView contentContainerStyle={styles.page} style={styles.root}>
      <Text style={styles.kicker}>Public beta</Text>
      <Text accessibilityRole="header" style={styles.title}>WordPoker is on TestFlight</Text>
      <Text style={styles.body}>
        Texas Hold’em with letter tiles: bet through the flop, turn and river while you build a
        word from your tiles and the board. Best word takes the pot.
      </Text>

      <Trailer />

      <View style={styles.actions}>
        <GoldButton
          label="Join the iOS beta"
          onPress={() => void Linking.openURL(TESTFLIGHT_URL)}
          testID="beta-testflight"
        />
        <GoldButton
          label="Sign up and play on the web"
          onPress={() => router.push("/sign-up")}
          testID="beta-sign-up"
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Joining on iPhone</Text>
        {STEPS.map((step, i) => (
          <Text key={step} style={[styles.body, styles.step]}>{`${i + 1}. ${step}`}</Text>
        ))}
      </View>

      <Text style={styles.footer}>
        Questions? privacy@wordpoker.app ·{" "}
        <Link href="/privacy" style={styles.link}>Privacy</Link>
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bg },
  page: {
    alignItems: "center",
    alignSelf: "center",
    gap: spacing.lg,
    maxWidth: 560,
    padding: spacing.gutter,
    paddingVertical: spacing.huge,
    width: "100%",
  },
  step: { textAlign: "left" },
  kicker: { color: colors.gold, fontFamily: fonts.ui, fontSize: fontSize.small, letterSpacing: 2, textTransform: "uppercase" },
  title: { color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.h2, textAlign: "center" },
  heading: { color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.bodyLg },
  body: { color: colors.text, fontFamily: fonts.sans, fontSize: fontSize.body, lineHeight: 22, textAlign: "center" },
  actions: { alignSelf: "stretch", gap: spacing.md, marginTop: spacing.sm },
  card: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
  },
  footer: { color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.small, textAlign: "center" },
  link: { color: colors.gold, textDecorationLine: "underline" },
});
