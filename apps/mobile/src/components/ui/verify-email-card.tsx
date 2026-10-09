/**
 * verify-email-card.tsx — the "confirm your email to claim the welcome coins" prompt (STO-566).
 *
 * The Wallet pays its welcome grant when the mail is verified (STO-346), so both screens that can
 * tell an unverified player where to go — Home, and the Coin Store while the grant is still
 * unclaimed — show this same card, resend button and all. `testID` names the card; its resend
 * button is `${testID}-resend`.
 */

import {
  Button,
  Column,
  Text,
  type UniversalStyle,
  type UniversalTextStyle,
} from "@expo/ui";
import { WELCOME_GRANT } from "@wordpoker/contracts";
import { useState } from "react";

import { authClient } from "@/auth/client/auth-client";
import { EMAIL_VERIFIED_CALLBACK } from "@/constants/links";
import {
  border,
  colors,
  fonts,
  fontSize,
  radius,
  spacing,
} from "@/constants/theme";
import { formatCoins } from "@/lib/format";
import { fullWidth } from "@/lib/full-width";

export function VerifyEmailCard({
  email,
  testID,
}: {
  email: string;
  testID: string;
}) {
  const [resend, setResend] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );

  const resendVerification = async () => {
    setResend("sending");
    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: EMAIL_VERIFIED_CALLBACK,
      });
      setResend(error ? "failed" : "sent");
    } catch {
      setResend("failed");
    }
  };

  return (
    <Column spacing={spacing.sm} testID={testID} {...fullWidth(styles.card)}>
      <Text textStyle={bodyText}>
        {`Verify your email to claim ${formatCoins(WELCOME_GRANT)} coins`}
      </Text>
      <Button
        disabled={resend === "sending" || resend === "sent"}
        label={resend === "sent" ? "Sent — check your inbox" : "Resend email"}
        onPress={resendVerification}
        testID={`${testID}-resend`}
        variant="outlined"
      />
      {resend === "failed" ? (
        <Text textStyle={errorText}>The email could not be sent. Try again.</Text>
      ) : null}
    </Column>
  );
}

const bodyText = {
  color: colors.text,
  fontFamily: fonts.sans,
  fontSize: fontSize.body,
} satisfies UniversalTextStyle;

const errorText = { ...bodyText, color: colors.danger } satisfies UniversalTextStyle;

const styles = {
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    width: "100%" as const,
  } satisfies UniversalStyle,
};
