import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";

import {
  fieldErrorForCode,
  validate,
  type AuthField,
  type AuthMode,
  type AuthValues,
  type FieldErrors,
} from "./auth-form";
import {
  AuthShell,
  CardLink,
  CardNote,
  Field,
  FooterLine,
  GoldButton,
  Pill,
  PillRow,
  SuggestionChips,
} from "./auth-shell";
import { EMAIL_VERIFIED_CALLBACK } from "@/constants/links";
import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, signInWithGameCenter } from "@/auth/client/game-center";
import { changeSession, setAutoRestore } from "@/auth/client/session-coordinator";
import { handleCandidates, MAX_HANDLE_LENGTH } from "@/auth/handle";
import { pendingHistory } from "@/lib/history/history-store";
import { syncHistory } from "@/lib/history/history-sync";
import { pendingReferral } from "@/lib/navigation/pending-destination";

const SUGGESTIONS_SHOWN = 3;

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
  { greeting: string; sub: string; submit: string; footer: string; footerCta: string; footerHref: Href }
> = {
  "sign-in": {
    greeting: "Welcome back.",
    sub: "We kept your seat warm.",
    submit: "TAKE YOUR SEAT",
    footer: "New here?",
    footerCta: "CREATE ACCOUNT",
    footerHref: "/sign-up",
  },
  "sign-up": {
    greeting: "Pull up a chair.",
    sub: "Pick the handle other players will see.",
    submit: "CREATE ACCOUNT",
    footer: "Have an account?",
    footerCta: "SIGN IN",
    footerHref: "/sign-in",
  },
};

/** The first few of a taken handle's alternatives that are free; a failed check just shows fewer. */
async function freeHandles(handle: string): Promise<string[]> {
  const free = await Promise.all(
    handleCandidates(handle).map(async (candidate) => {
      const { data } = await authClient.isUsernameAvailable({ username: candidate }).catch(() => ({ data: null }));
      return data?.available ? candidate : null;
    }),
  );
  return free.filter((candidate) => candidate !== null).slice(0, SUGGESTIONS_SHOWN);
}

/** Set by the guest tap until its session lands; see `playAsGuest`. */
let guestTapped = false;

function AuthScreen({ mode }: { mode: AuthMode }) {
  const copy = Copy[mode];
  const { data: session } = authClient.useSession();
  const guestId = session?.user.isAnonymous ? session.user.id : null;
  const [values, setValues] = useState<AuthValues>({ handle: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastLogin] = useState(() => authClient.getLastUsedLoginMethod());

  /** Fixing a value clears the error it was showing. */
  const edit = (field: AuthField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "handle") setSuggestions([]);
  };

  const rejectHandle = async (fieldErrors: FieldErrors) => {
    const free = await freeHandles(values.handle);
    setSuggestions(free);
    setErrors({ handle: free.length ? `${fieldErrors.handle} Try one of these:` : fieldErrors.handle });
  };

  const submit = async () => {
    const { handle, password } = values;
    const email = values.email.trim();
    const invalid = validate(mode, values);
    setErrors(invalid);
    setSuggestions([]);
    setError(null);
    if (Object.keys(invalid).length > 0) return;

    setPending(true);
    try {
      if (guestId && !(await guestHandsSaved(guestId))) {
        setError(UNSAVED_HANDS);
        return;
      }
      const { error: authError } = await changeSession(() => {
        if (mode === "sign-up") {
          return authClient.signUp.email({
            name: handle,
            username: handle,
            displayUsername: handle,
            email,
            password,
            callbackURL: EMAIL_VERIFIED_CALLBACK,
            fetchOptions: referralHeaders(),
          });
        }
        return email.includes("@")
          ? authClient.signIn.email({ email, password })
          : authClient.signIn.username({ username: email, password });
      });

      if (authError) {
        const fieldErrors = fieldErrorForCode(mode, authError.code, handle);
        if (authError.code === "USERNAME_IS_ALREADY_TAKEN" && fieldErrors) await rejectHandle(fieldErrors);
        else if (fieldErrors) setErrors(fieldErrors);
        else setError(authError.message ?? "Something went wrong. Please try again.");
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
    <AuthShell
      footer={
        <>
          {/* A friend opening an invite link has no account: an anonymous session seats them
              (STO-581), and the guard then lands the table the link named. */}
          {mode === "sign-in" && (
            <PillRow>
              {GAME_CENTER_AVAILABLE && <Pill label="GAME CENTER" lastLogin={lastLogin === "game-center"} onPress={continueWithGameCenter} />}
              <Pill label="PLAY AS GUEST" onPress={playAsGuest} />
            </PillRow>
          )}
          <FooterLine cta={copy.footerCta} onPress={() => router.push(copy.footerHref)} text={copy.footer} />
        </>
      }
      greeting={copy.greeting}
      sub={copy.sub}
    >
      {mode === "sign-up" && (
        <Field
          autoCapitalize="characters"
          autoComplete="username-new"
          autoCorrect={false}
          error={errors.handle}
          hint="3–12 letters or numbers"
          label="Handle"
          maxLength={MAX_HANDLE_LENGTH}
          onChangeText={(value) => edit("handle", value.toUpperCase())}
          placeholder="YOURHANDLE"
          value={values.handle}
        >
          {suggestions.length > 0 && (
            <SuggestionChips onPick={(value) => edit("handle", value)} values={suggestions} />
          )}
        </Field>
      )}
      <Field
        autoCapitalize="none"
        autoComplete={mode === "sign-up" ? "email" : "username"}
        autoCorrect={false}
        error={errors.email}
        keyboardType="email-address"
        label={mode === "sign-up" ? "Email" : "Email or handle"}
        onChangeText={(value) => edit("email", value)}
        placeholder={mode === "sign-up" ? "you@mail.com" : "you@mail.com or HANDLE"}
        value={values.email}
      />
      <Field
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        error={errors.password}
        label="Password"
        onChangeText={(value) => edit("password", value)}
        placeholder={mode === "sign-up" ? "8 or more characters" : "Your password"}
        secret
        value={values.password}
      />

      {mode === "sign-in" && (
        <CardLink label="Forgot password?" onPress={() => router.push("/forgot-password")} />
      )}

      {/* Moving a guest's hands into an account is the player's call, made before the flow starts. */}
      {guestId ? (
        <CardNote>
          {mode === "sign-in"
            ? "Signing in moves this guest's hands into that account."
            : "Your guest hands move into the new account."}
        </CardNote>
      ) : null}

      {error ? <CardNote error>{error}</CardNote> : null}

      <GoldButton
        label={copy.submit}
        lastLogin={mode === "sign-in" && (lastLogin === "email" || lastLogin === "username")}
        onPress={submit}
        pending={pending}
        pendingLabel="SEATING…"
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
