import { version } from 'expo/package.json';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, fontSize, spacing } from '@/constants/theme';

export function WebBadge() {
  return (
    <View style={styles.container}>
      <Text
        style={[
          { fontFamily: fonts.mono, fontSize: fontSize.caption, color: colors.textDim },
          styles.versionText,
        ]}>
        v{version}
      </Text>
      <Image
        source={require('@/assets/images/expo-badge-white.png')}
        style={styles.badgeImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  versionText: {
    textAlign: 'center',
  },
  badgeImage: {
    width: 123,
    aspectRatio: 123 / 24,
  },
});
