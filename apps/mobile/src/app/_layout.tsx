import { Inter_400Regular, Inter_500Medium, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono';
import { NotoSerif_400Regular, NotoSerif_700Bold } from '@expo-google-fonts/noto-serif';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { authClient } from '@/lib/auth-client';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();

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
  });

  // Keep the splash screen up until the first session check and the fonts resolve, so
  // a signed-in user never sees the sign-in screen flash on a cold load.
  if (isPending || !fontsLoaded) return null;

  return (
    <ThemeProvider value={DarkTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="tutorial" />
          <Stack.Screen name="table-demo" />
        </Stack.Protected>
        {/* Outside the guards: the emailed reset link may land while a stale
            session is still on the device, and the reset has to win. */}
        <Stack.Screen name="reset-password" />
      </Stack>
      <AnimatedSplashOverlay />
    </ThemeProvider>
  );
}
