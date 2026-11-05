/**
 * notification-settings.tsx — one switch per notification kind (STO-585), inside the account sheet.
 *
 * The switches are the account's (`notify*` on the Better Auth user), so they follow the player
 * across devices; the server checks them before it sends, so a hidden switch is not the only guard.
 * Each tap saves on its own (STO-1044). Where the OS has denied permission the switches still save,
 * and a link leads to system settings.
 */

import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { paper } from "@/components/screens/auth/auth-shell";
import { fonts } from "@/constants/theme";

import { CardSwitch, Panel, Row, SectionLabel } from "./account-card";

const KINDS = [
  { key: "notifyTableInvite", label: "Table invites", caption: "When a friend deals you in", fallback: true },
  { key: "notifyFriendRequest", label: "Friend requests", caption: "When someone adds you", fallback: true },
  { key: "notifyFriendOnline", label: "Friends coming online", caption: "When a friend shows up on the street", fallback: false },
] as const;

type Key = (typeof KINDS)[number]["key"];

export function NotificationSettings({ onSaved }: { onSaved: () => void }) {
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
      onSaved();
    } catch {
      setSaved((prev) => ({ ...prev, [key]: !value }));
      setError(true);
    }
  };

  return (
    <View style={styles.section}>
      <SectionLabel>Notifications</SectionLabel>
      <Panel>
        {KINDS.map(({ key, label, caption, fallback }) => (
          <Row
            caption={caption}
            end={
              <CardSwitch
                label={label}
                onChange={(value) => { void toggle(key, value); }}
                testID={`notify-${key}`}
                value={saved[key] ?? session?.user[key] ?? fallback}
              />
            }
            key={key}
            title={label}
          />
        ))}
      </Panel>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>Couldn’t save that. Try again.</Text> : null}
      {denied ? (
        <Text style={styles.note}>
          Notifications are off for Word Poker in system settings.{" "}
          <Text accessibilityRole="link" onPress={() => { void Linking.openSettings(); }} style={styles.link} testID="notify-open-settings">
            Open settings
          </Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  error: { color: paper.error, fontFamily: fonts.rubikMedium, fontSize: 13, lineHeight: 18 },
  note: { color: paper.body, fontFamily: fonts.rubik, fontSize: 13, lineHeight: 18 },
  link: { color: paper.link, fontFamily: fonts.rubikSemiBold, textDecorationLine: "underline" },
});
