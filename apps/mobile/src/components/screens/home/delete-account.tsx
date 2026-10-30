import { Button, Text, TextInput, useNativeState } from "@expo/ui";
import { useState } from "react";

import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, reauthenticateWithGameCenter } from "@/auth/client/game-center";
import { changeSession, setAutoRestore } from "@/auth/client/session-coordinator";
import { colors, fonts, fontSize } from "@/constants/theme";

const FAILED = "Couldn’t delete your account. Try again.";
// A dropped connection rejects instead of returning `{ error }`.
const UNREACHABLE = "Could not reach the server — check your connection and try again.";

/** The warning and confirmation inside Account settings (STO-821). Better Auth's providers name the proof asked for. */
export function DeleteAccount({ onBack, onDeleted, providers }: { onBack: () => void; onDeleted: () => void; providers: string[] }) {
  const usesPassword = providers.includes("credential");
  const usesGameCenter = !usesPassword && GAME_CENTER_AVAILABLE && providers.includes("game-center");
  const password = useNativeState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (usesPassword && !password.value) {
      setError("Enter your password.");
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      if (usesGameCenter) {
        const proven = await reauthenticateWithGameCenter();
        if (!proven.ok) {
          setError(proven.message);
          return;
        }
      }
      // Before the session goes: a restore must not make a new account from this device's Game Center.
      await setAutoRestore(false);
      const result = await changeSession(() => authClient.deleteUser(usesPassword ? { password: password.value } : {}));
      if (!result.error) {
        onDeleted();
        return;
      }
      await setAutoRestore(true);
      if (result.error.code === "INVALID_PASSWORD") setError("That password isn’t right.");
      else if (result.error.code === "SESSION_EXPIRED") setError("Sign out, sign back in, then try again.");
      else {
        console.warn("[delete-account] refused:", result.error.status, result.error.code, result.error.message);
        setError(FAILED);
      }
    } catch (failure) {
      console.warn("[delete-account] request failed:", failure);
      await setAutoRestore(true);
      setError(UNREACHABLE);
    } finally {
      setDeleting(false);
    }
  };

  const body = { color: colors.text, fontFamily: fonts.sans, fontSize: fontSize.body };

  return (
    <>
      <Text textStyle={{ color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.h3 }}>Delete account</Text>
      <Text textStyle={body}>This permanently deletes your account, coin balance, XP and level, match history, and friends. It can’t be undone.</Text>
      <Text textStyle={body}>Coins aren’t refundable. Refunds for purchases go through Apple or Google.</Text>
      <Text textStyle={{ color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.small }}>
        Hands you played with others stay in their history, with your name shown as Anonymous.
      </Text>
      {usesPassword ? (
        <>
          <Text textStyle={body}>Enter your password to confirm.</Text>
          <TextInput autoComplete="current-password" editable={!deleting} placeholder="Password" secureTextEntry testID="delete-account-password" value={password} />
        </>
      ) : null}
      {usesGameCenter ? <Text textStyle={body}>You’ll confirm with Game Center.</Text> : null}
      {error ? <Text textStyle={{ color: colors.danger }}>{error}</Text> : null}
      <Button disabled={deleting} label={deleting ? "Deleting…" : "Delete my account"} onPress={confirm} testID="delete-account-confirm" />
      <Button disabled={deleting} label="Keep my account" onPress={onBack} variant="text" testID="delete-account-back" />
    </>
  );
}
