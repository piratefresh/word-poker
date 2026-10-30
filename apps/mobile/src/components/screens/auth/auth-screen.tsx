import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";

import {
  AuthShell,
  Field,
  FooterLine,
  GoldButton,
} from "./auth-shell";
import { EMAIL_VERIFIED_CALLBACK } from "@/constants/links";
import { colors, theme } from "@/constants/theme";
import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, signInWithGameCenter } from "@/auth/client/game-center";
import { changeSession, setAutoRestore } from "@/auth/client/session-coordinator";
import { pendingHistory } from "@/lib/history/history-store";
import { syncHistory } from "@/lib/history/history-sync";
import { pendingReferral } from "@/lib/navigation/pending-destination";

/** `type` is the token group's own name: rename it so it reads as a style set. */
const { type: typography } = theme;

type AuthMode = "sign-in" | "sign-up";

/** The inviter whose link brought this device here (STO-582); the server attributes it once. */
function referralHeaders() {
  const ref = pendingReferral();
  return ref ? { headers: { "x-wordpoker-ref": ref } } : undefined;
}

const NETWORK_ERROR =
  "Could not reach the server — check your connection and try again.";

const UNSAVED_HANDS = "Your guest hands are still saving — check your connection and try again.";

/**
 * Registering deletes the guest once its server-side hands move over (STO-593), so the hands this
 * device has not uploaded yet go first; if any are still pending the player stays a guest.
 */
async function guestHandsSaved(guestId: string): Promise<boolean> {
  await syncHistory(guestId, () => {}).catch(() => {});
  return (await pendingHistory(guestId)).length === 0;
}

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

/** Set by the guest tap until its session lands; see `playAsGuest`. */
let guestTapped = false;

function AuthScreen({ mode }: { mode: AuthMode }) {
  const copy = Copy[mode];
  const { data: session } = authClient.useSession();
  const guestId = session?.user.isAnonymous ? session.user.id : null;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async () => {
    setPending(true);
    setError(null);

    try {
      if (guestId && !(await guestHandsSaved(guestId))) {
        setError(UNSAVED_HANDS);
        return;
      }
      const { error: authError } = await changeSession(() =>
        mode === "sign-up"
          ? authClient.signUp.email({ name, email, password, callbackURL: EMAIL_VERIFIED_CALLBACK, fetchOptions: referralHeaders() })
          : authClient.signIn.email({ email, password }),
      );

      if (authError) {
        setError(authError.message ?? "Something went wrong. Please try again.");
        return;
      }
      await setAutoRestore(true);
    } catch {
      // A dropped connection rejects instead of returning `{ error }`.
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  const continueWithGameCenter = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (guestId && !(await guestHandsSaved(guestId))) {
        setError(UNSAVED_HANDS);
        return;
      }
      const result = await signInWithGameCenter({ adoptGuestProgress: !!guestId });
      if (!result.ok) setError(result.message);
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  };

  // A guest may stay on these screens (to make an account later), so the guard never moves them
  // off: the guest tap goes home itself, once the session has reached the guard — not before, or
  // the guard would still be closed and bounce the player straight back here. The flag is the
  // module's because the guard flipping remounts this screen.
  useEffect(() => {
    if (!guestTapped || !guestId) return;
    guestTapped = false;
    router.replace("/");
  }, [guestId]);

  const playAsGuest = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      // Persisted for an existing guest too (an invite's): the tap is still the player's choice.
      await setAutoRestore(false);
      if (guestId) {
        router.replace("/");
        return;
      }
      guestTapped = true;
      const { error: authError } = await changeSession(() => authClient.signIn.anonymous());
      if (authError) {
        guestTapped = false;
        setError(authError.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      guestTapped = false;
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

      {/* Moving a guest's hands into an account is the player's call, made before the flow starts. */}
      {guestId ? (
        <Text style={styles.notice}>
          {mode === "sign-in"
            ? "Signing in moves this guest's hands into that account."
            : "Your guest hands move into the new account."}
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <GoldButton
        kicker={copy.kicker}
        label={guestId && mode === "sign-in" ? "Sign in & move hands" : copy.submit}
        onPress={submit}
        pending={pending}
      />

      {GAME_CENTER_AVAILABLE && (
        <FooterLine cta="Continue with Game Center" onPress={continueWithGameCenter} text="On iPhone?" />
      )}

      <FooterLine
        cta={copy.footerCta}
        onPress={() => router.push(copy.footerHref)}
        text={copy.footer}
      />

      {/* A friend opening an invite link has no account: an anonymous session seats them
          (STO-581), and the guard then lands the table the link named. */}
      {mode === "sign-in" && (
        <FooterLine cta="Play as guest" onPress={playAsGuest} text="No account?" />
      )}
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
  notice: {
    ...typography.body,
    color: colors.textDim,
  },
});
