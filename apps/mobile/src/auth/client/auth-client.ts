import { expoClient } from "@better-auth/expo/client";
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { apiBaseURL } from "@/lib/api-base-url";

export const authClient = createAuthClient({
  baseURL: apiBaseURL,
  plugins: [
    anonymousClient(),
    expoClient({
      scheme: "wordpoker",
      storagePrefix: "wordpoker",
      storage: SecureStore,
    }),
  ],
});
