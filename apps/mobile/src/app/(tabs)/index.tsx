import * as Device from 'expo-device';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { WebBadge } from '@/components/web-badge';
import { colors, fonts, fontSize, layout, radius, spacing, type } from '@/constants/theme';
import { authClient } from '@/lib/auth-client';

const codeText = {
  fontFamily: fonts.mono,
  fontSize: fontSize.caption,
  color: colors.textDim,
};

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <Text style={type.bodyDim}>use browser devtools</Text>;
  }
  if (Device.isDevice) {
    return (
      <Text style={type.bodyDim}>
        shake device or press <Text style={codeText}>m</Text> in terminal
      </Text>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <Text style={type.bodyDim}>
      press <Text style={codeText}>{shortcut}</Text>
    </Text>
  );
}

export default function HomeScreen() {
  const { data: session } = authClient.useSession();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.heroSection}>
          <AnimatedIcon />
          <Text style={[type.headline, styles.title]}>
            Welcome to&nbsp;Expo
          </Text>
        </View>

        <View style={styles.stepContainer}>
          <HintRow
            title="Signed in as"
            hint={<Text style={type.bodyDim}>{session?.user.email}</Text>}
          />
          <Pressable
            onPress={() => authClient.signOut()}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <Text style={{ ...type.body, color: colors.gold }}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={[codeText, styles.code]}>
          get started
        </Text>

        <View style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<Text style={codeText}>src/app/index.tsx</Text>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<Text style={codeText}>npm run reset-project</Text>}
          />
        </View>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
    paddingBottom: layout.tabBarHeight + spacing.lg,
    maxWidth: layout.maxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: spacing.xxl,
    gap: spacing.xxl,
    backgroundColor: colors.bg,
  },
  title: {
    textAlign: 'center',
  },
  code: {
    textTransform: 'uppercase',
  },
  stepContainer: {
    gap: spacing.lg,
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    borderRadius: radius.sheet,
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
});
