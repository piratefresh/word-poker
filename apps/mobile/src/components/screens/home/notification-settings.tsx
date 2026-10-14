/**
 * notification-settings.tsx — one switch per notification kind (STO-585), inside the account sheet.
 *
 * The switches are the account's (`notify*` on the Better Auth user), so they follow the player
 * across devices; the server checks them before it sends, so a hidden switch is not the only guard.
 * Where the OS has denied permission the switches still save, and a button leads to system settings.
 */

import { Button, Column, Switch, Text } from "@expo/ui";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Linking } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { colors, fonts, fontSize, spacing } from "@/constants/theme";

const KINDS = [
  { key: "notifyTableInvite", label: "Table invites", fallback: true },
  { key: "notifyFriendRequest", label: "Friend requests", fallback: true },
  { key: "notifyFriendOnline", label: "Friends coming online", fallback: false },
] as const;

type Key = (typeof KINDS)[number]["key"];

export function NotificationSettings() {
  const { data: session } = authClient.useSession();
  const [denied, setDenied] = useState(false);
  const [saved, setSaved] = useState<Partial<Record<Key, boolean>>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    void Notifications.getPermissionsAsync()
      .then(({ status }) => setDenied(status === "denied"))
      .catch(() => {});
  }, []);

  const toggle = async (key: Key, value: boolean) => {
    setError(false);
    setSaved((prev) => ({ ...prev, [key]: value }));
    try {
      const result = await authClient.updateUser({ [key]: value });
      if (result.error) throw new Error(result.error.message);
    } catch {
      setSaved((prev) => ({ ...prev, [key]: !value }));
      setError(true);
    }
  };

  return (
    <Column spacing={spacing.sm}>
      <Text textStyle={{ color: colors.text, fontFamily: fonts.sans, fontSize: fontSize.body }}>Notifications</Text>
      {KINDS.map(({ key, label, fallback }) => (
        <Switch
          key={key}
          label={label}
          onValueChange={(value) => { void toggle(key, value); }}
          testID={`notify-${key}`}
          value={saved[key] ?? session?.user[key] ?? fallback}
        />
      ))}
      {error ? <Text textStyle={{ color: colors.danger }}>Couldn’t save that. Try again.</Text> : null}
      {denied ? (
        <>
          <Text textStyle={{ color: colors.textDim, fontFamily: fonts.sans, fontSize: fontSize.small }}>
            Notifications are off for Word Poker in system settings.
          </Text>
          <Button label="Open system settings" onPress={() => { void Linking.openSettings(); }} testID="notify-open-settings" variant="text" />
        </>
      ) : null}
    </Column>
  );
}
