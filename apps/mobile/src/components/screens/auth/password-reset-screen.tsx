import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import {
  AuthShell,
  Field,
  FooterLine,
  GoldButton,
} from "@/components/screens/auth/auth-shell";
import { colors, theme } from "@/constants/theme";
import { RESET_PASSWORD_DEEP_LINK } from "@/constants/links";
import { authClient } from "@/lib/auth-client";

/** `type` is the token group's own name: rename it so it reads as a style set. */
const { type: typography } = theme;

/** Better Auth's default floor (`password.minPasswordLength`). */
const MIN_PASSWORD_LENGTH = 8;

const NETWORK_ERROR =
  "Could not reach the server — check your connection and try again.";

/**
 * Asks for the address, then claims a link went out — the API answers the same
 * way for unknown addresses, so the screen must not hint at which it was.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);

    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email,
        // The mail's button lands on Better Auth's callback, which hands the
        // token to this deep link.
        redirectTo: RESET_PASSWORD_DEEP_LINK,
      });

      if (authError) {
        setError(authError.message ?? "Something went wrong. Please try again.");
        return;
      }

      setSent(true);
    } catch {
      // A dropped connection rejects instead of returning `{ error }`.
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        greeting="Check your inbox."
        sub={`If ${email} has an account, a reset link is on its way. The link is good for one hour.`}
      >
        <Text style={styles.note}>
          Nothing after a minute? Check your spam folder, and make sure the
          address is the one you signed up with.
        </Text>
        <GoldButton
          kicker="BACK TO THE TABLE"
          label="Back to sign in"
          onPress={() => router.replace("/sign-in")}
        />
        <FooterLine
          cta="Try another email"
          onPress={() => {
            setEmail("");
            setSent(false);
          }}
          text="Wrong address?"
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      greeting="Forgot your password?"
      sub="Tell us the address on your account and we will send a link to set a new one."
    >
      <Field
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        label="EMAIL"
        onChangeText={setEmail}
        placeholder="Email"
        prefix="@"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GoldButton
        kicker="DEAL ME BACK IN"
        label="Send reset link"
        onPress={submit}
        pending={pending}
      />

      <FooterLine
        cta="Sign in"
        onPress={() => router.replace("/sign-in")}
        text="Remembered it?"
      />
    </AuthShell>
  );
}

/**
 * The screen the emailed deep link (`wordpoker://reset-password?token=…`) lands
 * on. The token is single-use and expires, so a missing or rejected one is a
 * normal state, not an error.
 */
export function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string; error?: string }>();
  const token = typeof params.token === "string" ? params.token : null;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!token) {
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      const { error: authError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });

      if (authError) {
        setError(authError.message ?? "Something went wrong. Please try again.");
        return;
      }

      setDone(true);
    } catch {
      // A dropped connection rejects instead of returning `{ error }`.
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  if (!token || params.error) {
    return (
      <AuthShell
        greeting="That link is spent."
        sub="Reset links are good for one hour and can only be used once."
      >
        <GoldButton
          kicker="GET A NEW LINK"
          label="Request another"
          onPress={() => router.replace("/forgot-password")}
        />
        <FooterLine
          cta="Sign in"
          onPress={() => router.replace("/sign-in")}
          text="Remembered it?"
        />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        greeting="Password updated."
        sub="Every other session on this account is signed out. Take your seat with the new password."
      >
        <GoldButton
          kicker="TAKE YOUR SEAT"
          label="Sign in"
          onPress={() => router.replace("/sign-in")}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      greeting="Choose a new password."
      sub="Pick something you have not used at this table before."
    >
      <Field
        autoComplete="new-password"
        label="NEW PASSWORD"
        onChangeText={setPassword}
        placeholder="Password"
        prefix="•"
        secureTextEntry
      />
      <Field
        autoComplete="new-password"
        label="CONFIRM PASSWORD"
        onChangeText={setConfirm}
        placeholder="Password"
        prefix="•"
        secureTextEntry
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GoldButton
        kicker="SET NEW PASSWORD"
        label="Update password"
        onPress={submit}
        pending={pending}
      />

      <FooterLine
        cta="Request a new one"
        onPress={() => router.replace("/forgot-password")}
        text="Link expired?"
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  note: {
    ...typography.bodyDim,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
