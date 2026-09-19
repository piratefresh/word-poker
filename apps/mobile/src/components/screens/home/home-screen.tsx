import { router, type Href } from "expo-router";
import {
  Button,
  Column,
  Host,
  Row,
  ScrollView,
  Spacer,
  Text,
  type UniversalTextStyle,
} from "@expo/ui";
import { useState } from "react";

import {
  ModeCard,
  type ModeCardProps,
} from "@/components/screens/home/components/mode-card";
import {
  colors,
  fonts,
  fontSize,
  layout,
  radius,
  spacing,
} from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

type ModeKey = "tutorial" | "online" | "offline" | "leaderboard";

type Mode = ModeCardProps & {
  key: ModeKey;
  /** The mode's screen. Modes without one still only mark intent. */
  href?: Href;
};

const MODES: Mode[] = [
  {
    key: "tutorial",
    href: "/tutorial",
    glyph: "🎓",
    label: "Tutorial",
    description: "Learn the hands in 2 minutes + 100 chips",
    badge: "Recommended",
    tone: "recommended",
  },
  {
    key: "online",
    glyph: "🌐",
    label: "Online Mode",
    description: "Play live opponents",
  },
  {
    key: "offline",
    // Temporary: the picker routes straight to the game. STO-269's landing screen owns
    // this entry (and the rows around it) when it lands.
    href: "/offline",
    glyph: "🤖",
    label: "Offline Mode",
    description: "Play a hand vs. bots, no stakes",
    tone: "warm",
  },
  {
    key: "leaderboard",
    glyph: "🏆",
    label: "Leaderboard",
    description: "Top players & best words",
    tone: "warm",
  },
];

const titleText = {
  color: colors.textBright,
  fontFamily: fonts.serifBold,
  fontSize: fontSize.h2,
  lineHeight: 36,
} satisfies UniversalTextStyle;

const kickerText = {
  color: colors.gold,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 2,
} satisfies UniversalTextStyle;

const signedInText = {
  color: colors.textDim,
  fontFamily: fonts.sans,
  fontSize: fontSize.small,
} satisfies UniversalTextStyle;

export function HomeScreen() {
  const { data: session } = authClient.useSession();
  const [pending, setPending] = useState<ModeKey | null>(null);

  // Modes with a route navigate; the rest don't exist yet, so selecting one
  // just marks intent for now.
  const handleSelect = (mode: Mode) => {
    if (mode.href) {
      router.push(mode.href);
      return;
    }
    setPending(mode.key);
  };

  return (
    <Host colorScheme="dark" seedColor={colors.gold} style={styles.host}>
      <ScrollView>
        <Column alignment="start" spacing={spacing.md} style={styles.screen}>
          <Text textStyle={titleText}>Choose how to play</Text>
          <Text textStyle={kickerText}>PICK ONE TO CONTINUE</Text>
          <Spacer size={spacing.sm} />

          {MODES.map((mode) => (
            <ModeCard
              key={mode.key}
              badge={mode.badge}
              description={mode.description}
              disabled={pending !== null && pending !== mode.key}
              glyph={mode.glyph}
              label={mode.label}
              onSelect={() => handleSelect(mode)}
              tone={mode.tone}
            />
          ))}

          <Spacer size={spacing.lg} />

          <Column spacing={spacing.md} style={styles.footer}>
            <Row alignment="center" style={{ width: "100%" }}>
              <Text textStyle={signedInText}>Signed in as</Text>
              <Spacer flexible />
              <Text textStyle={signedInText}>
                {session?.user.email ?? "Unknown player"}
              </Text>
            </Row>
            <Button
              label="Sign out"
              onPress={() => authClient.signOut()}
              variant="text"
            />
          </Column>

          <Spacer size={layout.tabBarHeight + spacing.lg} />
        </Column>
      </ScrollView>
    </Host>
  );
}

const styles = {
  host: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  screen: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.huge,
    width: "100%" as const,
  },
  footer: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    width: "100%" as const,
  },
};
