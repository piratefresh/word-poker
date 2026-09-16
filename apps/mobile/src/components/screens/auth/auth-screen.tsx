import { router, type Href } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import {
  AuthShell,
  Field,
  FooterLine,
  GoldButton,
} from "@/components/screens/auth/auth-shell";
import { colors, theme } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

/** `type` is the token group's own name: rename it so it reads as a style set. */
const { type: typography } = theme;

type AuthMode = "sign-in" | "sign-up";

const NETWORK_ERROR =
  "Could not reach the server — check your connection and try again.";

const Copy: Record<
  AuthMode,
  {
    greeting: string;
    sub: string;
    kicker: string;
    submit: string;
    footer: string;
    footerCta: string;
    footerHref: Href;
  }
> = {
  "sign-in": {
    greeting: "Welcome back.",
    sub: "We kept your seat warm.",
    kicker: "TAKE YOUR SEAT",
    submit: "Sign in",
    footer: "New here?",
    footerCta: "Create Account",
    footerHref: "/sign-up",
  },
  "sign-up": {
    greeting: "Take your seat.",
    sub: "Pick a handle and we will deal you in.",
    kicker: "SIT DOWN",
    submit: "Create an account",
    footer: "Already have a seat?",
    footerCta: "Sign in",
    footerHref: "/sign-in",
  },
};

function AuthScreen({ mode }: { mode: AuthMode }) {
  const copy = Copy[mode];
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);

    try {
      const { error: authError } =
        mode === "sign-up"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });

      if (authError) {
        setError(authError.message ?? "Something went wrong. Please try again.");
        return;
      }
    } catch {
      // A dropped connection rejects instead of returning `{ error }`.
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell greeting={copy.greeting} sub={copy.sub}>
      {mode === "sign-up" && (
        <Field
          autoCapitalize="words"
          autoComplete="name"
          label="NAME"
          onChangeText={setName}
          placeholder="Name"
        />
      )}
      <Field
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        label="EMAIL OR HANDLE"
        onChangeText={setEmail}
        placeholder="Email"
        prefix="@"
      />
      <Field
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        label="PASSWORD"
        onChangeText={setPassword}
        placeholder="Password"
        prefix="•"
        secureTextEntry
      />

      {mode === "sign-in" && (
        <Text
          accessibilityRole="link"
          onPress={() => router.push("/forgot-password")}
          style={styles.forgot}
        >
          Forgot password?
        </Text>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GoldButton
        kicker={copy.kicker}
        label={copy.submit}
        onPress={submit}
        pending={pending}
      />

      <FooterLine
        cta={copy.footerCta}
        onPress={() => router.push(copy.footerHref)}
        text={copy.footer}
      />
    </AuthShell>
  );
}

export function SignInScreen() {
  return <AuthScreen mode="sign-in" />;
}

export function SignUpScreen() {
  return <AuthScreen mode="sign-up" />;
}

const styles = StyleSheet.create({
  forgot: {
    ...typography.label,
    color: colors.gold,
    textAlign: "center",
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
