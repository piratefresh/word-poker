import { lastLoginMethodClient } from "@better-auth/expo/plugins";
import * as SecureStore from "expo-secure-store";

/** Native has no cookies to read, so the device keeps the method itself. Web: the `.web` fork. */
const METHOD_BY_PATH: Record<string, string> = {
  "/sign-in/email": "email",
  "/sign-up/email": "email",
  "/sign-in/username": "username",
  "/platform-auth/game-center": "game-center",
};

export const lastLoginClient = () =>
  lastLoginMethodClient({
    storage: SecureStore,
    storagePrefix: "wordpoker",
    customResolveMethod: (url) => {
      const { pathname } = new URL(url.toString());
      return Object.entries(METHOD_BY_PATH).find(([path]) => pathname.endsWith(path))?.[1];
    },
  });
