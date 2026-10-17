import { HistoryProvider } from "@/lib/history/history-provider";
import { Fredoka_600SemiBold, Fredoka_700Bold } from "@expo-google-fonts/fredoka";
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
import { RobotoSlab_800ExtraBold } from "@expo-google-fonts/roboto-slab";
import * as Sentry from "@sentry/react-native";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { DarkTheme, router, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { authClient } from "@/auth/client/auth-client";
import { GAME_CENTER_AVAILABLE, restoreWithGameCenter } from "@/auth/client/game-center";
import { changeSessionIfSignedOut } from "@/auth/client/session-coordinator";
import { colors } from "@/constants/theme";
import { E2E_AUTH_BYPASS } from "@/lib/e2e";
import {
  destinationFromURL,
  rememberDestination,
  rememberReferral,
  takeDestination,
  type Destination,
} from "@/lib/pending-destination";
import { leaveTable } from "@/features/online/room-session";
import { QuestsProvider } from "@/lib/quests-provider";
import { useRevenueCatIdentity } from "@/lib/use-revenuecat";
import { usePresence } from "@/lib/use-presence";
import { usePushRegistration } from "@/lib/use-push-registration";
import { TableInviteBanner } from "@/components/ui/table-invite-banner";

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
const styles = StyleSheet.create({
  root: { flex: 1 },
  restoring: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});

/** How long a signed-out iOS launch hides sign-in while Game Center answers. */
const RESTORE_COVER_MS = 15_000;

export function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  // Purchases credit the signed-in player's Wallet, so RevenueCat follows the session (STO-346).
  useRevenueCatIdentity(session?.user.id);
  const account = !!session && !session.user.isAnonymous;
  const presence = usePresence(account);
  usePushRegistration(account);

  // E2E builds have no auth server and no account: the guard takes their word for it instead
  // of holding the table behind a session nothing can start (`src/lib/e2e.ts`).
  const authed = E2E_AUTH_BYPASS || !!session;
  // A guest can still reach sign-up: the results screen offers to turn the guest into an account.
  const showAuth = !authed || !!session?.user.isAnonymous;

  // The design system asks for these families by name (`fonts.*`), so they have to
  // be registered before the first frame paints.
  const [fontsLoaded] = useFonts({
    Rubik_400Regular: require("@/assets/fonts/rubik-regular.ttf"),
    Rubik_500Medium: require("@/assets/fonts/rubik-medium.ttf"),
    Rubik_600SemiBold: require("@/assets/fonts/rubik-semibold.ttf"),
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    RobotoSlab_800ExtraBold,
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

  // Signed out on iOS: Game Center may sign straight back in (STO-591) once the UI is up to present
  // its sheet. It checks the guest/sign-out choice and yields to any session that appears first.
  // Until it settles a plain cover hides the sign-in screen, so a returning player never sees it
  // flash; the cover is a view, not the native splash, so Apple's sheet can still present over it.
  // Capped, in case GameKit never answers.
  const signedOut = !E2E_AUTH_BYPASS && !isPending && !session && fontsLoaded;
  const [restoring, setRestoring] = useState(GAME_CENTER_AVAILABLE && !E2E_AUTH_BYPASS);
  useEffect(() => {
    if (!signedOut) return;
    const cap = setTimeout(() => setRestoring(false), RESTORE_COVER_MS);
    // Signed in: lifted only once the new session has been read, so sign-in does not flash first.
    void restoreWithGameCenter()
      .then((signedIn) => (signedIn ? authClient.getSession() : null))
      .catch(() => null)
      .finally(() => setRestoring(false));
    return () => clearTimeout(cap);
  }, [signedOut]);

  // Keep the splash screen up until the first session check and the fonts resolve, so
  // a signed-in user never sees the sign-in screen flash on a cold load. An E2E build's
  // session check can only fail — nothing is listening — so it does not wait on one.
  if ((isPending && !E2E_AUTH_BYPASS) || !fontsLoaded) return null;

  return (
    <DeepLinks session={!!session} account={account}>
      <GestureHandlerRootView style={styles.root}>
        <ThemeProvider value={DarkTheme}>
          <QuestsProvider>
            <HistoryProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Protected guard={showAuth}>
                  <Stack.Screen name="sign-in" />
                  <Stack.Screen name="sign-up" />
                  <Stack.Screen name="forgot-password" />
                </Stack.Protected>
                <Stack.Protected guard={authed}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="tutorial" />
                  <Stack.Screen name="offline" />
                  <Stack.Screen name="online" />
                  <Stack.Screen name="friend/[code]" />
                  <Stack.Screen name="online/[roomId]" />
                </Stack.Protected>
                <Stack.Protected guard={__DEV__}>
                  <Stack.Screen name="dev-ledger" />
                </Stack.Protected>
                {/* Outside the guards: the emailed reset link may land while a stale
                    session is still on the device, and the reset has to win. */}
                <Stack.Screen name="reset-password" />
              </Stack>
              {restoring && !session ? (
                <View accessibilityLabel="Signing in with Game Center" style={styles.restoring}>
                  <ActivityIndicator color={colors.gold} />
                </View>
              ) : null}
              <AnimatedSplashOverlay />
              <TableInviteBanner invite={presence.invite} onDismiss={presence.dismiss} />
            </HistoryProvider>
          </QuestsProvider>
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
// On web the guard has already bounced a signed-out visitor to /sign-in by the time an effect asks
// Linking for the launch URL, so the invite is read here, before the router renders.
const WEB_LAUNCH_URL = typeof document === "undefined" ? null : document.URL;

function DeepLinks({
  session,
  account,
  children,
}: {
  session: boolean;
  account: boolean;
  children: ReactNode;
}) {
  // The launch URL is the app's own; only the first run may read it, or a later session change
  // would re-follow the link the device was already started with.
  const launchRead = useRef(false);
  const initialConsumed = useRef(false);
  const [initialDestination, setInitialDestination] =
    useState<Destination | null>(null);

  // A friend arriving by invite link has no account and should not need one: a link that names a
  // table opens a guest session on its own (STO-581), whether it launched the app or arrived while
  // it was open. One try per launch; if it fails, the sign-in screen's "Play as guest" is still there.
  const guestTried = useRef(false);
  const playAsGuest = useCallback(() => {
    if (guestTried.current) return;
    guestTried.current = true;
    void changeSessionIfSignedOut(() => authClient.signIn.anonymous()).catch(() => {});
  }, []);

  useEffect(() => {
    if (!launchRead.current) {
      launchRead.current = true;
      // Do not cancel this promise when auth changes: a signed-out launch can resolve after the
      // user signs in, and the current session must decide whether it is routed or remembered.
      void (WEB_LAUNCH_URL !== null ? Promise.resolve(WEB_LAUNCH_URL) : Linking.getInitialURL())
        .then((url) => {
          rememberReferral(url);
          setInitialDestination(destinationFromURL(url) ?? null);
        })
        .catch(() => {});
    }
  }, []);

  // A link that arrives while the app is open: a URL, or a tapped notification carrying one (STO-585).
  const follow = useCallback((url: string) => {
    rememberReferral(url);
    const destination = destinationFromURL(url);
    if (!destination) return;
    if (session && (destination.pathname !== "/friends" || account)) {
      router.replace(destination);
      return;
    }
    rememberDestination(destination);
    if (!session && destination.pathname !== "/friends") playAsGuest();
  }, [account, session, playAsGuest]);

  useEffect(() => {
    const arriving = Linking.addEventListener("url", ({ url }) => follow(url));
    return () => arriving.remove();
  }, [follow]);

  // A notification tapped while the app was closed is the launch's own link, read once.
  const notificationRead = useRef(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === "string") follow(url);
    };
    if (!notificationRead.current) {
      notificationRead.current = true;
      open(Notifications.getLastNotificationResponse());
    }
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    return () => tapped.remove();
  }, [follow]);

  // Signed out, the seat is not a seat: the guarded routes are unreachable until someone signs in
  // again, so the device gives the table up rather than leaving the server counting a player who
  // cannot reach it — a room counts connections, and this one would count a ghost.
  useEffect(() => {
    if (session) return;
    void leaveTable();
  }, [session]);

  useEffect(() => {
    if (
      !session &&
      !initialConsumed.current &&
      initialDestination !== null &&
      initialDestination.pathname !== "/friends"
    ) playAsGuest();
  }, [initialDestination, session, playAsGuest]);

  // Signed in: land on whatever link was waiting for a session, once. The launch URL is kept in
  // state until it resolves, so auth can finish before Linking answers without losing the route.
  useEffect(() => {
    if (!session) return;
    const destination = takeDestination() ?? (initialConsumed.current ? null : initialDestination);
    if (!destination) return;
    if (destination.pathname === "/friends" && !account) {
      rememberDestination(destination);
      return;
    }
    initialConsumed.current = true;
    router.replace(destination);
  }, [account, initialDestination, session]);

  return children;
}

export default Sentry.wrap(RootLayout);
