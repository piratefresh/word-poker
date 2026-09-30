import { router, type Href } from "expo-router";
import {
  Button,
  Column,
  Host,
  RNHostView,
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
import {
  ModeVariants,
  type ModeVariant,
} from "@/components/screens/home/components/mode-variants";
import { authClient } from "@/lib/auth-client";

type ModeKey = "tutorial" | "online" | "offline" | "leaderboard";

type Variant = ModeVariant & { href: Href };

type Mode = ModeCardProps & {
  key: ModeKey;
  /** The mode's screen. Modes without one still only mark intent. */
  href?: Href;
  /** The mode's own choices, each with its own screen, in place of `href`. */
  variants?: readonly Variant[];
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
    href: "/online",
    glyph: "🌐",
    label: "Online Mode",
    description: "Play live opponents",
  },
  {
    key: "offline",
    // Temporary: the picker routes straight to the game. STO-269's landing screen owns
    // this entry (and the rows around it) when it lands.
    glyph: "🤖",
    label: "Offline Mode",
    description: "Play a hand vs. bots, no stakes",
    tone: "warm",
    variants: [
      {
        key: "normal",
        href: "/offline",
        art: require("@/assets/images/ui/icons/normal-mode.png"),
        label: "Normal",
        description: "Standard rules",
        testID: "offline-normal",
      },
      {
        key: "wild",
        // The table's power-ups switch (STO-484): the offline adapter reads it off the route.
        href: { pathname: "/offline", params: { powers: "wild" } },
        art: require("@/assets/images/ui/icons/wildpower-mode.png"),
        label: "Wild Power",
        description: "Pick a power each hand",
        tone: "featured",
        testID: "offline-wild",
      },
    ],
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
  const handleSelect = (mode: Mode, href = mode.href) => {
    if (href) {
      router.push(href);
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

          {MODES.map((mode) => {
            const disabled = pending !== null && pending !== mode.key;
            const { variants } = mode;
            return (
              <ModeCard
                key={mode.key}
                badge={mode.badge}
                description={mode.description}
                disabled={disabled}
                glyph={mode.glyph}
                label={mode.label}
                onSelect={() => handleSelect(mode)}
                tone={mode.tone}
              >
                {variants ? (
                  <RNHostView>
                    <ModeVariants
                      disabled={disabled}
                      onSelect={(variant) => handleSelect(mode, variant.href)}
                      variants={variants}
                    />
                  </RNHostView>
                ) : null}
              </ModeCard>
            );
          })}

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
