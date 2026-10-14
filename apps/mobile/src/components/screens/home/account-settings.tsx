import { BottomSheet, Button, Column, Host, Text, TextInput, useNativeState } from "@expo/ui";
import { isPlaceholderEmail } from "@wordpoker/contracts";
import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { colors, fonts, fontSize, spacing } from "@/constants/theme";

import { NotificationSettings } from "./notification-settings";

/** Better Auth's provider ids, as the player knows them. */
const LOGIN_METHODS: Record<string, string> = { credential: "Email", "game-center": "Game Center", google: "Google" };

export function AccountSettings({ onDismiss }: { onDismiss: () => void }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.isAnonymous ? null : session?.user.id;
  const [methods, setMethods] = useState<string | null>(null);
  useEffect(() => {
    if (!userId) return;
    void authClient.listAccounts().then(({ data }) => {
      if (data?.length) setMethods(data.map((account) => LOGIN_METHODS[account.providerId] ?? account.providerId).join(", "));
    }, () => {});
  }, [userId]);
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

  return (
    <BottomSheet containerColor={colors.bgElevated} isPresented onDismiss={onDismiss} testID="account-settings">
      <View style={{ paddingBottom: spacing.lg }}>
        <Host colorScheme="dark" seedColor={colors.gold} matchContents>
          <Column spacing={spacing.md} style={{ width: width - spacing.lg * 2 }}>
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
            {session?.user.isAnonymous ? null : <NotificationSettings />}
            {error ? <Text textStyle={{ color: colors.danger }}>{error}</Text> : null}
            <Button disabled={saving} label={saving ? "Saving…" : "Save changes"} onPress={save} testID="account-save" />
            <Button disabled={saving} label="Cancel" onPress={onDismiss} variant="text" />
          </Column>
        </Host>
      </View>
    </BottomSheet>
  );
}
