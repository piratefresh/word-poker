import { BottomSheet, Button, Column, Host, Text, TextInput, useNativeState } from "@expo/ui";
import { isPlaceholderEmail } from "@wordpoker/contracts";
import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, linkGameCenter } from "@/auth/client/game-center";
import { colors, fonts, fontSize, spacing } from "@/constants/theme";

import { DeleteAccount } from "./delete-account";
import { NotificationSettings } from "./notification-settings";

/** Better Auth's provider ids, as the player knows them. */
const LOGIN_METHODS: Record<string, string> = { credential: "Email", "game-center": "Game Center", google: "Google" };

export function AccountSettings({ onDismiss }: { onDismiss: () => void }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.isAnonymous ? null : session?.user.id;
  // Kept with the account it was read for, so a different (or no) account never shows these.
  const [loaded, setLoaded] = useState<{ userId: string; providers: string[] } | null>(null);
  const providers = userId && loaded?.userId === userId ? loaded.providers : null;
  const methods = providers?.map((provider) => LOGIN_METHODS[provider] ?? provider).join(", ");
  const [listed, setListed] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let current = true;
    void authClient.listAccounts().then(({ data }) => {
      if (current && data?.length) setLoaded({ userId, providers: data.map((account) => account.providerId) });
    }, () => {});
    return () => { current = false; };
  }, [userId, listed]);
  // Offered once the methods are known, so an account that already has Game Center never sees it.
  const canLinkGameCenter = GAME_CENTER_AVAILABLE && !!providers && !providers.includes("game-center");
  const [linking, setLinking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const name = useNativeState(session?.user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const save = async () => {
    const nextName = name.value.trim();
    if (!nextName) {
      setError("Enter a display name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await authClient.updateUser({ name: nextName });
      if (result.error) {
        setError("Couldn’t save your name. Try again.");
        return;
      }
      onDismiss();
    } catch {
      setError("Couldn’t save your name. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const link = async () => {
    setLinking(true);
    setError(null);
    try {
      const result = await linkGameCenter();
      // A Game Center player already linked to another account stays there: nothing merges.
      if (result.ok) setListed((n) => n + 1);
      else setError(result.message);
    } catch {
      setError("Couldn’t link Game Center. Try again.");
    } finally {
      setLinking(false);
    }
  };

  return (
    <BottomSheet containerColor={colors.bgElevated} isPresented onDismiss={onDismiss} testID="account-settings">
      <View style={{ paddingBottom: spacing.lg }}>
        <Host colorScheme="dark" seedColor={colors.gold} matchContents>
          <Column spacing={spacing.md} style={{ width: width - spacing.lg * 2 }}>
            {deleting && providers ? (
              <DeleteAccount onBack={() => setDeleting(false)} onDeleted={onDismiss} providers={providers} />
            ) : (
              <>
                <Text textStyle={{ color: colors.textBright, fontFamily: fonts.ui, fontSize: fontSize.h3 }}>Account settings</Text>
                <Text textStyle={{ color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.small }}>
                  {session?.user.isAnonymous
                    ? "Guest account"
                    : isPlaceholderEmail(session?.user.email) ? "" : session?.user.email}
                </Text>
                {methods ? (
                  <Text textStyle={{ color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.small }}>{`Sign-in: ${methods}`}</Text>
                ) : null}
                <Text textStyle={{ color: colors.text, fontFamily: fonts.sans, fontSize: fontSize.body }}>Display name</Text>
                <TextInput placeholder="Display name" editable={!saving} testID="account-display-name" value={name} />
                {canLinkGameCenter ? (
                  <Button disabled={linking} label={linking ? "Linking…" : "Link Game Center"} onPress={link} variant="text" testID="account-link-game-center" />
                ) : null}
                {session?.user.isAnonymous ? null : <NotificationSettings />}
                {error ? <Text textStyle={{ color: colors.danger }}>{error}</Text> : null}
                <Button disabled={saving} label={saving ? "Saving…" : "Save changes"} onPress={save} testID="account-save" />
                <Button disabled={saving} label="Cancel" onPress={onDismiss} variant="text" />
                {/* Waits on the sign-in methods, which guests never load: they have no account to delete. */}
                {providers ? <Button disabled={saving} label="Delete account" onPress={() => setDeleting(true)} variant="text" testID="account-delete" /> : null}
              </>
            )}
          </Column>
        </Host>
      </View>
    </BottomSheet>
  );
}
