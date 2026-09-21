import { Inter_400Regular, Inter_500Medium, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { NotoSerif_400Regular, NotoSerif_700Bold, NotoSerif_700Bold_Italic } from '@expo-google-fonts/noto-serif';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { authClient } from '@/lib/auth-client';
import { E2E_AUTH_BYPASS } from '@/lib/e2e';

SplashScreen.preventAutoHideAsync();

/**
 * Gesture Handler's root, because the app now owns gestures: the word builder's tiles are
 * dragged with `react-native-reanimated-dnd`, which rides on this view the same way every
 * Gesture Handler app does. Above the theme provider, so nothing inside has to know.
 */
const styles = StyleSheet.create({ root: { flex: 1 } });

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();

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
    NotoSerif_400Regular,
    NotoSerif_700Bold,
    NotoSerif_700Bold_Italic,
  });

  // Keep the splash screen up until the first session check and the fonts resolve, so
  // a signed-in user never sees the sign-in screen flash on a cold load. An E2E build's
  // session check can only fail — nothing is listening — so it does not wait on one.
  if ((isPending && !E2E_AUTH_BYPASS) || !fontsLoaded) return null;

  return (
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
          </Stack.Protected>
          {/* Outside the guards: the emailed reset link may land while a stale
              session is still on the device, and the reset has to win. */}
          <Stack.Screen name="reset-password" />
        </Stack>
        <AnimatedSplashOverlay />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
