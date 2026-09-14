import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

/**
 * The Better Auth handler is an Expo API route (`src/app/api/auth/[...all]+api.ts`),
 * so in development it is served by the dev server that bundled the app. `hostUri`
 * is that server as the device sees it, which keeps physical devices working.
 * Production builds must point `EXPO_PUBLIC_AUTH_URL` at the deployed backend.
 */
const devServerURL =
  __DEV__ && Constants.expoConfig?.hostUri
    ? `http://${Constants.expoConfig.hostUri}`
    : "http://localhost:8081";

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_AUTH_URL ?? devServerURL,
  plugins: [
    expoClient({
      scheme: "wordpoker",
      storagePrefix: "wordpoker",
      storage: SecureStore,
    }),
  ],
});
