import PostHog from "posthog-react-native";
import { Platform } from "react-native";

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;

// Without both, analytics and error tracking are off; the app still runs (tests, E2E, fresh clones).
if ((!projectToken || !host) && __DEV__ && process.env.NODE_ENV !== "test") {
  console.warn("PostHog is off: set EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN and EXPO_PUBLIC_POSTHOG_HOST.");
}

export const posthog = projectToken && host
  ? new PostHog(projectToken, {
      host,
      // The SDK's file storage is native-only; in the browser it finds none and throws.
      customStorage: Platform.OS === "web" && typeof window !== "undefined" ? window.localStorage : undefined,
      captureAppLifecycleEvents: true,
      errorTracking: {
        autocapture: {
          uncaughtExceptions: true,
          unhandledRejections: true,
          // Console output is not part of this app's error-monitoring scope.
          console: [],
        },
      },
      preloadFeatureFlags: true,
      // Replay is native-only; it also needs "Record user sessions" on in the project settings.
      enableSessionReplay: Platform.OS !== "web",
      sessionReplayConfig: {
        sampleRate: 0.1,
        screenshotScale: 0.5,
        screenshotColorMode: "RGB_565",
      },
    })
  : null;
