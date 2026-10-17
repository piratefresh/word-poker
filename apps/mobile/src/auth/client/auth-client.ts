import { expoClient } from "@better-auth/expo/client";
import { anonymousClient, inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { apiBaseURL } from "@/lib/network/api-base-url";

import { platformAuthClient } from "./platform-auth-client";

export const authClient = createAuthClient({
  baseURL: apiBaseURL,
  plugins: [
    anonymousClient(),
    platformAuthClient(),
    // Mirrors `user.additionalFields` in auth.ts (server-only, so its types cannot be imported here).
    inferAdditionalFields({
      user: {
        notifyTableInvite: { type: "boolean", required: false },
        notifyFriendRequest: { type: "boolean", required: false },
        notifyFriendOnline: { type: "boolean", required: false },
        primaryIdentityVerified: { type: "boolean", required: false, input: false },
      },
    }),
    expoClient({
      scheme: "wordpoker",
      storagePrefix: "wordpoker",
      storage: SecureStore,
    }),
  ],
});
