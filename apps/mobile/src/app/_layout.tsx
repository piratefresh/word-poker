import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
  Inter_800ExtraBold,
} from "@expo-google-fonts/inter";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";
import { LilitaOne_400Regular } from "@expo-google-fonts/lilita-one";
import {
  NotoSerif_400Regular,
  NotoSerif_700Bold,
  NotoSerif_700Bold_Italic,
} from "@expo-google-fonts/noto-serif";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { DarkTheme, router, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { authClient } from "@/auth/client/auth-client";
import { E2E_AUTH_BYPASS } from "@/lib/e2e";
import {
  destinationFromURL,
  rememberDestination,
  takeDestination,
  type Destination,
} from "@/lib/pending-destination";
import { leaveTable } from "@/features/online/room-session";
import { useRevenueCatIdentity } from "@/lib/use-revenuecat";

Sentry.init({
  dsn: "https://275e0d7eaac4989bad2cdca3b110a5c0@o4512200430125056.ingest.us.sentry.io/4512200442904576",

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    Sentry.mobileReplayIntegration(),
    Sentry.feedbackIntegration(),
  ],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

SplashScreen.preventAutoHideAsync();

/**
 * Gesture Handler's root, because the app now owns gestures: the word builder's tiles are
 * dragged with `react-native-reanimated-dnd`, which rides on this view the same way every
 * Gesture Handler app does. Above the theme provider, so nothing inside has to know.
 */
const styles = StyleSheet.create({ root: { flex: 1 } });

export function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  // Purchases credit the signed-in player's Wallet, so RevenueCat follows the session (STO-346).
  useRevenueCatIdentity(session?.user.id);

  // E2E builds have no auth server and no account: the guard takes their word for it instead
  // of holding the table behind a session nothing can start (`src/lib/e2e.ts`).
  const authed = E2E_AUTH_BYPASS || !!session;

  // The design system asks for these families by name (`fonts.*`), so they have to
  // be registered before the first frame paints.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
    Inter_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
    LilitaOne_400Regular,
    NotoSerif_400Regular,
    NotoSerif_700Bold,
    NotoSerif_700Bold_Italic,
  });

  // Keep the splash screen up until the first session check and the fonts resolve, so
  // a signed-in user never sees the sign-in screen flash on a cold load. An E2E build's
  // session check can only fail — nothing is listening — so it does not wait on one.
  if ((isPending && !E2E_AUTH_BYPASS) || !fontsLoaded) return null;

  return (
    <DeepLinks session={!!session}>
      <GestureHandlerRootView style={styles.root}>
        <ThemeProvider value={DarkTheme}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!authed}>
              <Stack.Screen name="sign-in" />
              <Stack.Screen name="sign-up" />
              <Stack.Screen name="forgot-password" />
            </Stack.Protected>
            <Stack.Protected guard={authed}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="tutorial" />
              <Stack.Screen name="offline" />
              <Stack.Screen name="online" />
              <Stack.Screen name="online/[roomId]" />
            </Stack.Protected>
            {/* Outside the guards: the emailed reset link may land while a stale
                session is still on the device, and the reset has to win. */}
            <Stack.Screen name="reset-password" />
          </Stack>
          <AnimatedSplashOverlay />
        </ThemeProvider>
      </GestureHandlerRootView>
    </DeepLinks>
  );
}

/**
 * The app's arrival links — `wordpoker://online?room=…` and its web equivalent.
 *
 * A link can arrive before the device can take it: the guard bounces a signed-out device to
 * sign-in, and by the time a session exists the URL that started it is long gone. So the launch
 * URL and every later one are read here, above the guard, and a link that names a table is held
 * (`pending-destination`) until there is a session to land it with. Nothing is navigated to that
 * the guard would immediately throw away.
 */
function DeepLinks({
  session,
  children,
}: {
  session: boolean;
  children: ReactNode;
}) {
  // The launch URL is the app's own; only the first run may read it, or a later session change
  // would re-follow the link the device was already started with.
  const launchRead = useRef(false);
  const initialConsumed = useRef(false);
  const [initialDestination, setInitialDestination] =
    useState<Destination | null>(null);

  useEffect(() => {
    if (!launchRead.current) {
      launchRead.current = true;
      // Do not cancel this promise when auth changes: a signed-out launch can resolve after the
      // user signs in, and the current session must decide whether it is routed or remembered.
      void Linking.getInitialURL()
        .then((url) => setInitialDestination(destinationFromURL(url) ?? null))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    const arriving = Linking.addEventListener("url", ({ url }) => {
      const destination = destinationFromURL(url);
      if (!destination) return;
      if (session) {
        router.replace(destination);
        return;
      }
      rememberDestination(destination);
    });
    return () => arriving.remove();
  }, [session]);

  // Signed out, the seat is not a seat: the guarded routes are unreachable until someone signs in
  // again, so the device gives the table up rather than leaving the server counting a player who
  // cannot reach it — a room counts connections, and this one would count a ghost.
  useEffect(() => {
    if (session) return;
    void leaveTable();
  }, [session]);

  // Signed in: land on whatever link was waiting for a session, once. The launch URL is kept in
  // state until it resolves, so auth can finish before Linking answers without losing the route.
  useEffect(() => {
    if (!session || initialConsumed.current) return;
    const destination = takeDestination() ?? initialDestination;
    if (!destination) return;
    initialConsumed.current = true;
    router.replace(destination);
  }, [initialDestination, session]);

  return children;
}

export default Sentry.wrap(RootLayout);
