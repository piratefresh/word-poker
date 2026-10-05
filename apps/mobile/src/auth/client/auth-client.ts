import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

import { apiBaseURL } from "@/lib/api-base-url";

export const authClient = createAuthClient({
  baseURL: apiBaseURL,
  plugins: [
    expoClient({
      scheme: "wordpoker",
      storagePrefix: "wordpoker",
      storage: SecureStore,
    }),
  ],
});
