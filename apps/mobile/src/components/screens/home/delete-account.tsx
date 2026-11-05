import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, reauthenticateWithGameCenter } from "@/auth/client/game-center";
import { changeSession, setAutoRestore } from "@/auth/client/session-coordinator";
import { Field, paper } from "@/components/screens/auth/auth-shell";
import { fonts } from "@/constants/theme";

const FAILED = "Couldn’t delete your account. Try again.";
// A dropped connection rejects instead of returning `{ error }`.
const UNREACHABLE = "Could not reach the server — check your connection and try again.";
const CONFIRM_WORD = "DELETE";

/**
 * The red-edged confirmation at the foot of Account settings (STO-821, restyled in STO-1044).
 * Typing DELETE arms the button; Better Auth's providers name the proof asked for on top of that.
 */
export function DeleteAccount({ onBack, onDeleted, providers }: { onBack: () => void; onDeleted: () => void; providers: string[] }) {
  const usesPassword = providers.includes("credential");
  const usesGameCenter = !usesPassword && GAME_CENTER_AVAILABLE && providers.includes("game-center");
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armed = typed.trim().toUpperCase() === CONFIRM_WORD && !deleting;

  const confirm = async () => {
    if (!armed) return;
    if (usesPassword && !password) {
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
      const result = await changeSession(() => authClient.deleteUser(usesPassword ? { password } : {}));
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

  return (
    <View style={styles.panel} testID="delete-account">
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>Delete your account?</Text>
        <Text style={styles.body}>
          You’ll lose your level, your coins and your friends list, along with your XP and match history. This can’t be undone.
        </Text>
        <Text style={styles.small}>Coins aren’t refundable. Refunds for purchases go through Apple or Google.</Text>
        <Text style={styles.small}>Hands you played with others stay in their history, with your name shown as Anonymous.</Text>
      </View>
      <Field
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!deleting}
        label="Type DELETE to confirm"
        onChangeText={setTyped}
        placeholder={CONFIRM_WORD}
        testID="delete-account-word"
        value={typed}
      />
      {usesPassword ? (
        <Field
          autoComplete="current-password"
          editable={!deleting}
          label="Password"
          onChangeText={setPassword}
          onSubmitEditing={() => { void confirm(); }}
          secret
          testID="delete-account-password"
          value={password}
        />
      ) : null}
      {usesGameCenter ? <Text style={styles.small}>You’ll confirm with Game Center.</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          disabled={deleting}
          onPress={onBack}
          style={({ pressed }) => [styles.action, styles.keep, pressed && styles.keepPressed]}
          testID="delete-account-back"
        >
          <Text style={styles.keepLabel}>KEEP IT</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Delete my account"
          accessibilityRole="button"
          accessibilityState={{ busy: deleting, disabled: !armed }}
          disabled={!armed}
          onPress={() => { void confirm(); }}
          style={({ pressed }) => [styles.action, armed ? styles.danger : styles.dangerOff, pressed && armed && styles.dangerPressed]}
          testID="delete-account-confirm"
        >
          {armed ? <LinearGradient colors={["#e5574a", "#b3322a"]} style={StyleSheet.absoluteFill} /> : null}
          <Text style={[styles.dangerLabel, !armed && styles.dangerLabelOff]}>{deleting ? "DELETING…" : CONFIRM_WORD}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: "#fbe4d8", borderColor: "#c2352b", borderRadius: 14, borderWidth: 2, gap: 12, padding: 16 },
  copy: { gap: 6 },
  title: { color: paper.ink, fontFamily: fonts.arcade, fontSize: 20 },
  body: { color: "#7a3a2a", fontFamily: fonts.rubik, fontSize: 13, lineHeight: 18 },
  small: { color: paper.body, fontFamily: fonts.rubik, fontSize: 12, lineHeight: 16 },
  error: { color: paper.error, fontFamily: fonts.rubikMedium, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10 },
  action: { alignItems: "center", borderRadius: 12, flex: 1, height: 46, justifyContent: "center", overflow: "hidden" },
  keep: { backgroundColor: "#fffdf6", boxShadow: "0px 4px 0px #c4743a" },
  keepPressed: { boxShadow: "0px 2px 0px #c4743a", transform: [{ translateY: 2 }] },
  keepLabel: { color: paper.ink, fontFamily: fonts.arcade, fontSize: 16, letterSpacing: 0.64 },
  danger: { boxShadow: "0px 4px 0px #7a1c15" },
  dangerPressed: { boxShadow: "0px 2px 0px #7a1c15", transform: [{ translateY: 2 }] },
  dangerOff: { backgroundColor: "#ead8b6" },
  dangerLabel: { color: "#fff", fontFamily: fonts.arcade, fontSize: 16, letterSpacing: 0.64 },
  dangerLabelOff: { color: "#a8906c" },
});
