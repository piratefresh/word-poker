/**
 * api-base-url.ts — where this app's own API is served from.
 *
 * The auth handler is an Expo API route (`src/app/api/auth/[...all]+api.ts`), so in development it
 * is served by the dev server that bundled the app; the results rating's route
 * (`src/app/api/results-rating+api.ts`) is served from the same origin. `hostUri` is that server as
 * the device sees it, which keeps physical devices working, and production builds must point
 * `EXPO_PUBLIC_AUTH_URL` at the deployed backend.
 *
 * It lives in its own module rather than beside the auth client because it is the host that is
 * shared, not the session: a caller that only needs to post to a route (the rating card) would
 * otherwise pull Better Auth, SecureStore and the whole client into its dependency graph — which is
 * also what a test of that caller would then have to stub.
 */

import Constants from "expo-constants";

const devServerURL =
  __DEV__ && Constants.expoConfig?.hostUri
    ? `http://${Constants.expoConfig.hostUri}`
    : "http://localhost:8081";

/**
 * The origin this app's API routes are served from. Exported so no second module re-derives the
 * host; the order is the one the auth client has always used.
 */
export const apiBaseURL = process.env.EXPO_PUBLIC_AUTH_URL ?? devServerURL;
