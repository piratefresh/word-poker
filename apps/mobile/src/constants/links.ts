/**
 * Deep links into the native app. The scheme has to match `expo.scheme` in
 * `app.json` and `expoClient({ scheme })` in `src/lib/auth-client.ts`.
 */

/** Where a reset link sends the app. Better Auth appends `?token=…`. */
export const RESET_PASSWORD_DEEP_LINK = "wordpoker://reset-password";
