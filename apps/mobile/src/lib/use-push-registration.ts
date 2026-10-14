/**
 * use-push-registration.ts — registers this device's Expo push token against the signed-in account
 * (STO-585). Accounts only: guests have no friends to be notified about. The web build has none
 * (`.web.ts`); its in-app banner covers invites.
 */

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";

import { registerPushToken, unregisterPushToken } from "@/lib/friends-client";

/** The token this device last registered, kept so sign-out can take it back. */
let registered: string | null = null;

export function usePushRegistration(account: boolean): void {
  useEffect(() => {
    if (!account) return;
    void (async () => {
      if (Platform.OS === "android") {
        // Android 13+ only asks for permission once a channel exists.
        await Notifications.setNotificationChannelAsync("default", {
          name: "Friends",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      await registerPushToken(data);
      registered = data;
    })().catch((error: unknown) => console.warn("[push] registration failed:", error));
  }, [account]);
}

/** Sign-out: stop pushes to this device. Call it before the session goes, the API needs it. */
export async function unregisterPush(): Promise<void> {
  if (registered === null) return;
  const token = registered;
  registered = null;
  await unregisterPushToken(token);
}
