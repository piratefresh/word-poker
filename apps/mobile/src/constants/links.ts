/**
 * Deep links into the native app. The scheme has to match `expo.scheme` in
 * `app.json` and `expoClient({ scheme })` in `src/auth/client/auth-client.ts`.
 */

import { Platform } from "react-native";

/** Where a reset link sends the app. Better Auth appends `?token=…`. */
export const RESET_PASSWORD_DEEP_LINK = "wordpoker://reset-password";

/** Where a verified email sends the app: Home. */
export const EMAIL_VERIFIED_DEEP_LINK = "wordpoker://";

/**
 * What a mail's `callbackURL` names once it has done its work: Home in the app on a device, or
 * this web origin's root in a browser (a desktop has no `wordpoker://` handler).
 */
export const EMAIL_VERIFIED_CALLBACK =
  Platform.OS === "web" ? "/" : EMAIL_VERIFIED_DEEP_LINK;
