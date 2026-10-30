import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";

import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_SHORT } from "./auth-form";
import { AuthShell, CardNote, Field, FooterLine, GoldButton } from "./auth-shell";
import { RESET_PASSWORD_DEEP_LINK } from "@/constants/links";
import { authClient } from "@/auth/client/auth-client";

const NETWORK_ERROR =
  "Could not reach the server — check your connection and try again.";

/**
 * Asks for the address, then claims a link went out — the API answers the same
 * way for unknown addresses, so the screen must not hint at which it was.
 */
export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim()) {
      setEmailError("Enter your email.");
      return;
    }

    setPending(true);

    try {
      const { error: authError } = await authClient.requestPasswordReset({
        email: email.trim(),
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
        footer={
          <FooterLine
            cta="TRY AGAIN"
            onPress={() => {
              setEmail("");
              setSent(false);
            }}
            text="Wrong email?"
          />
        }
        greeting="Check your email."
        sub={`If ${email.trim()} has an account, we sent it a reset link. It expires in 30 minutes.`}
      >
        <GoldButton label="BACK TO SIGN IN" onPress={() => router.replace("/sign-in")} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      footer={<FooterLine cta="SIGN IN" onPress={() => router.replace("/sign-in")} text="Remembered it?" />}
      greeting="Forgot your password?"
      sub="Enter your email and we'll send a reset link."
    >
      <Field
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        error={emailError}
        keyboardType="email-address"
        label="Email"
        onChangeText={(value) => {
          setEmail(value);
          setEmailError(undefined);
        }}
        placeholder="you@mail.com"
        value={email}
      />

      {error ? <CardNote error>{error}</CardNote> : null}

      <GoldButton label="SEND RESET LINK" onPress={submit} pending={pending} pendingLabel="SENDING…" />
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
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!token) {
      return;
    }

    setError(null);

    if (!password) {
      setPasswordError("Create a password.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(PASSWORD_TOO_SHORT);
      return;
    }

    if (password !== confirm) {
      setConfirmError("Those two passwords do not match.");
      return;
    }

    setPending(true);

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
        footer={<FooterLine cta="SIGN IN" onPress={() => router.replace("/sign-in")} text="Remembered it?" />}
        greeting="That link is spent."
        sub="Reset links expire in 30 minutes and can only be used once."
      >
        <GoldButton label="REQUEST ANOTHER" onPress={() => router.replace("/forgot-password")} />
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        greeting="Password updated."
        sub="Every other session on this account is signed out. Take your seat with the new password."
      >
        <GoldButton label="SIGN IN" onPress={() => router.replace("/sign-in")} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      footer={<FooterLine cta="REQUEST A NEW ONE" onPress={() => router.replace("/forgot-password")} text="Link expired?" />}
      greeting="Choose a new password."
      sub="Pick something you have not used at this table before."
    >
      <Field
        autoComplete="new-password"
        error={passwordError}
        label="New password"
        onChangeText={(value) => {
          setPassword(value);
          setPasswordError(undefined);
        }}
        placeholder="8 or more characters"
        secret
        value={password}
      />
      <Field
        autoComplete="new-password"
        error={confirmError}
        label="Confirm password"
        onChangeText={(value) => {
          setConfirm(value);
          setConfirmError(undefined);
        }}
        placeholder="Same again"
        secret
        value={confirm}
      />

      {error ? <CardNote error>{error}</CardNote> : null}

      <GoldButton label="UPDATE PASSWORD" onPress={submit} pending={pending} pendingLabel="SAVING…" />
    </AuthShell>
  );
}
