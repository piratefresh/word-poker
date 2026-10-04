/**
 * store-screen.tsx — the coin store (STO-346): the Wallet's balance and the packs that top it up.
 *
 * Reached from Home only while `EXPO_PUBLIC_COIN_STORE` is on. The balance shows on every platform;
 * packs sell only in a mobile build with RevenueCat's key (`revenuecatAvailable`), and a buy button
 * waits until RevenueCat is logged in as this player, since the purchase credits that Wallet.
 */

import {
  Button,
  Column,
  Host,
  Row,
  ScrollView,
  Spacer,
  Text,
  type UniversalStyle,
  type UniversalTextStyle,
} from "@expo/ui";
import { WELCOME_GRANT } from "@wordpoker/contracts";
import { router } from "expo-router";
import { useState } from "react";

import { border, colors, fonts, fontSize, layout, radius, spacing } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";
import { fullWidth } from "@/lib/full-width";

import type { CoinPackRow } from "./coin-packs";
import { useCoinStore, type PurchaseNotice } from "./use-coin-store";

/** `12,000` — grouped by hand like `formatAmount`, so every platform prints the same digits. */
function formatCoins(coins: number): string {
  return Math.trunc(coins)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function noticeText(notice: PurchaseNotice): string {
  if (notice.kind === "added") return `+${formatCoins(notice.coins)} COINS ADDED`;
  if (notice.kind === "on-the-way") return "Coins are on their way.";

  return notice.message;
}

export function StoreScreen() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const store = useCoinStore(user?.id);
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  const resendVerification = async () => {
    if (!user) return;
    setResend("sending");
    try {
      const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: "/" });
      setResend(error ? "failed" : "sent");
    } catch {
      setResend("failed");
    }
  };

  const signedOut = store.balance.status === "signed-out";

  return (
    <Host colorScheme="dark" seedColor={colors.gold} style={styles.host}>
      <ScrollView>
        <Column alignment="start" spacing={spacing.md} {...fullWidth(styles.screen)}>
          <Button label="Back" onPress={() => router.back()} testID="store-back" variant="text" />
          <Text textStyle={titleText}>Coin Store</Text>
          <Text textStyle={kickerText}>TOP UP YOUR WALLET</Text>
          <Spacer size={spacing.sm} />

          {signedOut ? (
            <Text testID="store-signed-out" textStyle={bodyText}>
              Sign in to top up.
            </Text>
          ) : (
            <>
              <Column spacing={spacing.xs} {...fullWidth(styles.card)}>
                <Text textStyle={captionText}>WALLET</Text>
                {store.balance.status === "ready" ? (
                  <Text testID="wallet-coins" textStyle={balanceText}>
                    {`${formatCoins(store.balance.coins)} COINS`}
                  </Text>
                ) : store.balance.status === "error" ? (
                  <Text testID="wallet-error" textStyle={errorText}>
                    {store.balance.message}
                  </Text>
                ) : (
                  <Text textStyle={bodyText}>Counting your coins…</Text>
                )}
                {store.notice ? (
                  <Text
                    testID="store-notice"
                    textStyle={store.notice.kind === "error" ? errorText : noticeTextStyle}
                  >
                    {noticeText(store.notice)}
                  </Text>
                ) : null}
              </Column>

              {user && !user.emailVerified ? (
                <Column spacing={spacing.sm} testID="store-verify" {...fullWidth(styles.card)}>
                  <Text textStyle={bodyText}>
                    {`Verify your email to claim ${formatCoins(WELCOME_GRANT)} coins`}
                  </Text>
                  <Button
                    disabled={resend === "sending" || resend === "sent"}
                    label={resend === "sent" ? "Sent — check your inbox" : "Resend email"}
                    onPress={resendVerification}
                    testID="store-verify-resend"
                    variant="outlined"
                  />
                  {resend === "failed" ? (
                    <Text textStyle={errorText}>The email could not be sent. Try again.</Text>
                  ) : null}
                </Column>
              ) : null}

              {store.packs.status === "unavailable" ? (
                <Text testID="store-unavailable" textStyle={captionText}>
                  Coin packs are available in the mobile app.
                </Text>
              ) : store.packs.status === "loading" ? (
                <Text textStyle={bodyText}>Opening the store…</Text>
              ) : store.packs.status === "error" ? (
                <Text testID="store-packs-error" textStyle={errorText}>
                  {store.packs.message}
                </Text>
              ) : (
                store.packs.rows.map((row) => (
                  <PackRow
                    key={row.productId}
                    buying={store.buying === row.productId}
                    disabled={!store.canBuy || store.buying !== null}
                    onBuy={() => void store.buy(row)}
                    row={row}
                  />
                ))
              )}
            </>
          )}

          <Spacer size={layout.tabBarHeight + spacing.lg} />
        </Column>
      </ScrollView>
    </Host>
  );
}

function PackRow({
  row,
  buying,
  disabled,
  onBuy,
}: {
  row: CoinPackRow;
  buying: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <Column spacing={spacing.sm} testID={`store-pack-${row.productId}`} {...fullWidth(styles.card)}>
      {row.badge ? (
        <Row {...fullWidth()}>
          <Row alignment="center" style={badgePill}>
            <Text textStyle={badgeText}>{row.badge.toUpperCase()}</Text>
          </Row>
        </Row>
      ) : null}
      <Row alignment="center" spacing={spacing.md} {...fullWidth()}>
        <Column spacing={spacing.xxs}>
          {row.label ? <Text textStyle={captionText}>{row.label}</Text> : null}
          <Text textStyle={packCoinsText}>{`+${formatCoins(row.coins)}`}</Text>
        </Column>
        <Spacer flexible />
        <Button
          disabled={disabled}
          label={buying ? "Buying…" : row.priceString}
          onPress={onBuy}
          testID={`store-buy-${row.productId}`}
          variant="filled"
        />
      </Row>
    </Column>
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

const errorText = { ...bodyText, color: colors.danger } satisfies UniversalTextStyle;

const noticeTextStyle = {
  color: colors.successHi,
  fontFamily: fonts.monoBold,
  fontSize: fontSize.small,
  letterSpacing: 1.2,
} satisfies UniversalTextStyle;

const balanceText = {
  color: colors.goldHi,
  fontFamily: fonts.sansBlack,
  fontSize: fontSize.title,
} satisfies UniversalTextStyle;

const packCoinsText = {
  color: colors.textBright,
  fontFamily: fonts.sansBold,
  fontSize: fontSize.bodyLg,
} satisfies UniversalTextStyle;

const badgePill: UniversalStyle = {
  backgroundColor: colors.bgElevated,
  borderRadius: radius.pill,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
};

const badgeText = {
  color: colors.goldHi,
  fontFamily: fonts.monoBold,
  fontSize: fontSize.micro,
  letterSpacing: 1.6,
} satisfies UniversalTextStyle;

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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    width: "100%" as const,
  },
};
