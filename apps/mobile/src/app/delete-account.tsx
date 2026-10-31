import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";

import { colors, fonts, fontSize, spacing } from "@/constants/theme";

/** The public page Google Play requires for deleting an account without the app (STO-821). */
export default function DeleteAccountPage() {
  return (
    <ScrollView contentContainerStyle={styles.page} style={styles.root}>
      <Text accessibilityRole="header" style={styles.title}>Delete your Word Poker account</Text>
      <Text style={styles.body}>
        1. <Link href="/" style={styles.link}>Sign in to Word Poker</Link> on this site.
      </Text>
      <Text style={styles.body}>2. Open the menu on your avatar and choose Settings.</Text>
      <Text style={styles.body}>3. Choose Delete account and confirm with your password.</Text>
      <Text style={styles.body}>If you only sign in with Game Center, do the same in the iOS app.</Text>
      <Text accessibilityRole="header" style={styles.heading}>What is deleted</Text>
      <Text style={styles.body}>Your account, coin balance, XP and level, match history, and friends are deleted right away.</Text>
      <Text accessibilityRole="header" style={styles.heading}>What is kept</Text>
      <Text style={styles.body}>
        Hands you played with others stay in their history, with your name shown as Anonymous. A log of coin transactions is
        kept for our accounts, with nothing linking it to your name or email.
      </Text>
      <Text style={styles.body}>Coins aren’t refundable. Refunds for purchases go through Apple or Google.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.bgElevated },
  page: { gap: spacing.md, maxWidth: 640, width: "100%", alignSelf: "center", padding: spacing.lg },
  title: { color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.h3 },
  heading: { color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.body, marginTop: spacing.sm },
  body: { color: colors.text, fontFamily: fonts.sans, fontSize: fontSize.body },
  link: { color: colors.gold, textDecorationLine: "underline" },
});
