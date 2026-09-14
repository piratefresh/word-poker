import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExternalLink } from '@/components/external-link';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { colors, fontSize, fonts, layout, spacing, type } from '@/constants/theme';

export default function TabTwoScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + layout.tabBarHeight + spacing.lg,
  };

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
      paddingBottom: insets.bottom,
    },
    web: {
      paddingTop: spacing.huge,
      paddingBottom: spacing.xxl,
    },
  });

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: colors.bg }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <View style={styles.container}>
        <View style={styles.titleContainer}>
          <Text style={type.headline}>Explore</Text>
          <Text style={[type.body, styles.centerText, { color: colors.textDim }]}>
            This starter app includes example{'\n'}code to help you get started.
          </Text>

          <ExternalLink href="https://docs.expo.dev" asChild>
            <Pressable style={({ pressed }) => pressed && styles.pressed}>
              <View style={[styles.linkButton, { backgroundColor: colors.surface }]}>
                <Text style={{ ...type.body, color: colors.textDim }}>Expo documentation</Text>
                <SymbolView
                  tintColor={colors.text}
                  name={{ ios: 'arrow.up.right.square', android: 'link', web: 'link' }}
                  size={12}
                />
              </View>
            </Pressable>
          </ExternalLink>
        </View>

        <View style={styles.sectionsWrapper}>
          <Collapsible title="File-based routing">
            <Text style={type.bodyDim}>
              This app has two screens: <Text style={styles.code}>src/app/index.tsx</Text> and{' '}
              <Text style={styles.code}>src/app/explore.tsx</Text>
            </Text>
            <Text style={type.bodyDim}>
              The layout file in <Text style={styles.code}>src/app/_layout.tsx</Text> sets up
              the tab navigator.
            </Text>
            <ExternalLink href="https://docs.expo.dev/router/introduction">
              <Text style={{ ...type.body, color: colors.gold }}>Learn more</Text>
            </ExternalLink>
          </Collapsible>

          <Collapsible title="Android, iOS, and web support">
            <View style={[styles.collapsibleContent, { backgroundColor: colors.surface }]}>
              <Text style={type.bodyDim}>
                You can open this project on Android, iOS, and the web. To open the web version,
                press <Text style={{ ...type.body, fontFamily: fonts.sansBold }}>w</Text> in the terminal running this
                project.
              </Text>
              <Image
                source={require('@/assets/images/tutorial-web.png')}
                style={styles.imageTutorial}
              />
            </View>
          </Collapsible>

          <Collapsible title="Images">
            <Text style={type.bodyDim}>
              For static images, you can use the <Text style={styles.code}>@2x</Text> and{' '}
              <Text style={styles.code}>@3x</Text> suffixes to provide files for different
              screen densities.
            </Text>
            <Image source={require('@/assets/images/react-logo.png')} style={styles.imageReact} />
            <ExternalLink href="https://reactnative.dev/docs/images">
              <Text style={{ ...type.body, color: colors.gold }}>Learn more</Text>
            </ExternalLink>
          </Collapsible>

          <Collapsible title="Light and dark mode components">
            <Text style={type.bodyDim}>
              This template has light and dark mode support. The{' '}
              <Text style={styles.code}>useColorScheme()</Text> hook lets you inspect what the
              user&apos;s current color scheme is, and so you can adjust UI colors accordingly.
            </Text>
            <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
              <Text style={{ ...type.body, color: colors.gold }}>Learn more</Text>
            </ExternalLink>
          </Collapsible>

          <Collapsible title="Animations">
            <Text style={type.bodyDim}>
              This template includes an example of an animated component. The{' '}
              <Text style={styles.code}>src/components/ui/collapsible.tsx</Text> component uses
              the powerful <Text style={styles.code}>react-native-reanimated</Text> library to
              animate opening this hint.
            </Text>
          </Collapsible>
        </View>
        {Platform.OS === 'web' && <WebBadge />}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: layout.maxContentWidth,
    flexGrow: 1,
    backgroundColor: colors.bg,
  },
  titleContainer: {
    gap: spacing.lg,
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.huge,
    backgroundColor: colors.bg,
  },
  centerText: {
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  linkButton: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
    borderRadius: 32,
    justifyContent: 'center',
    gap: spacing.xs,
    alignItems: 'center',
  },
  sectionsWrapper: {
    gap: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    backgroundColor: colors.bg,
  },
  collapsibleContent: {
    alignItems: 'center',
  },
  imageTutorial: {
    width: '100%',
    aspectRatio: 296 / 171,
    borderRadius: 16,
    marginTop: spacing.sm,
  },
  imageReact: {
    width: 100,
    height: 100,
    alignSelf: 'center',
  },
  code: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    color: colors.textDim,
  },
});
