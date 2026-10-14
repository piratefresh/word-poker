/**
 * quests-screen.tsx — Quests (STO-525): the Wallet's total, the login streak, and the catalog.
 *
 * Style of `store-screen.tsx`, the Coin Store's sibling behind the same `EXPO_PUBLIC_COIN_STORE`
 * flag: an `@expo/ui` `Host` over a `ScrollView` of cards. `useQuests()` already holds the state —
 * this screen only draws it, and pulls a fresh read on mount so a day's streak credit from an
 * earlier launch is not stuck showing yesterday's.
 */

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
import { STREAK_REWARDS, isAccountEligible } from "@wordpoker/contracts";
import { QUEST_CATALOG } from "@wordpoker/game-rules";
import { router } from "expo-router";
import { useEffect, type ReactElement } from "react";
import { StyleSheet, View, Text as RNText } from "react-native";

import { border, colors, fonts, fontSize, layout, radius, spacing } from "@/constants/theme";
import { authClient } from "@/auth/client/auth-client";
import { formatCoins } from "@/lib/format";
import { fullWidth } from "@/lib/full-width";
import { useQuests } from "@/lib/quests-provider";

export function QuestsScreen(): ReactElement {
  const { data: session } = authClient.useSession();
  const { coins, state, refresh } = useQuests();

  // One pull on the way in: the provider's own read ran at launch, and a day may have turned
  // since then.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const user = session?.user;
  const signedOut = !user;
  const unverified = Boolean(user) && !isAccountEligible(user);
  const current = state?.streak.current ?? 0;

  return (
    <Host colorScheme="dark" seedColor={colors.gold} style={styles.host}>
      <ScrollView>
        <Column alignment="start" spacing={spacing.md} {...fullWidth(styles.screen)}>
          <Button label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} testID="quests-back" variant="text" />
          <Text textStyle={titleText}>Quests</Text>
          <Text textStyle={kickerText}>EARN COINS FOR WINS &amp; STREAKS</Text>
          <Spacer size={spacing.sm} />

          {signedOut ? (
            <Text testID="quests-signed-out" textStyle={bodyText}>
              Sign in to earn coins
            </Text>
          ) : unverified ? (
            <Text testID="quests-unverified" textStyle={bodyText}>
              Verify your email to earn coins
            </Text>
          ) : (
            <>
              <Column spacing={spacing.xs} testID="quest-wallet" {...fullWidth(styles.card)}>
                <Text textStyle={captionText}>WALLET</Text>
                <Text textStyle={balanceText}>
                  {coins === null ? "—" : `${formatCoins(coins)} COINS`}
                </Text>
              </Column>

              <Column spacing={spacing.sm} testID="quest-streak" {...fullWidth(styles.card)}>
                <Text textStyle={captionText}>{`LOGIN STREAK · DAY ${current}`}</Text>
                <RNHostView matchContents>
                  <StreakStrip current={current} />
                </RNHostView>
              </Column>

              {QUEST_CATALOG.map((def) => {
                const row = state?.quests.find((candidate) => candidate.id === def.id);
                return (
                  <QuestRow
                    description={def.description}
                    done={row?.done ?? false}
                    goal={def.goal}
                    id={def.id}
                    key={def.id}
                    progress={row?.progress ?? 0}
                    reward={def.reward}
                    title={def.title}
                  />
                );
              })}
            </>
          )}

          <Spacer size={layout.tabBarHeight + spacing.lg} />
        </Column>
      </ScrollView>
    </Host>
  );
}

function QuestRow({
  id,
  title,
  description,
  goal,
  reward,
  progress,
  done,
}: {
  id: string;
  title: string;
  description: string;
  goal: number;
  reward: number;
  progress: number;
  done: boolean;
}): ReactElement {
  return (
    <Column spacing={spacing.xxs} testID={`quest-row-${id}`} {...fullWidth(styles.card)}>
      <Row alignment="center" spacing={spacing.md} {...fullWidth()}>
        <Column spacing={spacing.xxs}>
          <Text textStyle={questTitleText}>{title}</Text>
          <Text textStyle={bodyText}>{description}</Text>
        </Column>
        <Spacer flexible />
        <Text textStyle={done ? doneText : progressText}>{done ? "✓" : `${progress}/${goal}`}</Text>
      </Row>
      <Text textStyle={rewardText}>{`+${reward}`}</Text>
    </Column>
  );
}

/** Seven pips, one per `STREAK_REWARDS` day; the day the streak is on now is lit. */
function StreakStrip({ current }: { current: number }): ReactElement {
  const todayIndex = current > 0 ? (current - 1) % STREAK_REWARDS.length : -1;

  return (
    <View style={pipStyles.row}>
      {STREAK_REWARDS.map((reward, index) => (
        <View
          key={index}
          style={[pipStyles.pip, index === todayIndex && pipStyles.pipToday]}
          testID={`quest-streak-pip-${index + 1}`}
        >
          <RNText style={pipStyles.day}>{index + 1}</RNText>
          <RNText style={pipStyles.reward}>{`+${reward}`}</RNText>
        </View>
      ))}
    </View>
  );
}

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

const captionText = {
  color: colors.textDim,
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  letterSpacing: 1.6,
} satisfies UniversalTextStyle;

const bodyText = {
  color: colors.text,
  fontFamily: fonts.sans,
  fontSize: fontSize.body,
} satisfies UniversalTextStyle;

const balanceText = {
  color: colors.goldHi,
  fontFamily: fonts.sansBlack,
  fontSize: fontSize.title,
} satisfies UniversalTextStyle;

const questTitleText = {
  color: colors.textBright,
  fontFamily: fonts.sansBold,
  fontSize: fontSize.bodyLg,
} satisfies UniversalTextStyle;

const progressText = {
  color: colors.textDim,
  fontFamily: fonts.monoBold,
  fontSize: fontSize.body,
} satisfies UniversalTextStyle;

const doneText = { ...progressText, color: colors.successHi } satisfies UniversalTextStyle;

const rewardText = {
  color: colors.gold,
  fontFamily: fonts.monoBold,
  fontSize: fontSize.caption,
  letterSpacing: 1.2,
} satisfies UniversalTextStyle;

const styles = StyleSheet.create({
  host: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  screen: {
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.huge,
    width: "100%",
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    width: "100%",
  },
});

const pipStyles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.xs },
  pip: {
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderRadius: radius.sm,
    flex: 1,
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
  },
  pipToday: {
    backgroundColor: colors.goldDeep,
  },
  day: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
  },
  reward: {
    color: colors.textBright,
    fontFamily: fonts.monoBold,
    fontSize: fontSize.micro,
  },
});
