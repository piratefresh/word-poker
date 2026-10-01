import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { useChipImage } from "@/components/chip/use-chip-image";
import { ChipSprite, type ChipSpritePose, type ChipSpriteTone } from "@/components/chip/chip-sprite";
import {
  chipTones,
  colors,
  type ChipTone,
  fonts,
  spacing,
} from "@/constants/theme";

/**
 * Development gallery for the painted chip (STO-481): every tone face on and tilted, at the
 * sizes the felt uses, to hold against the reference sheet. Renders nothing in a release build.
 */
const SIZES = [13, 28, 64, 96] as const;
const TILTS = [0, 0.95] as const;
const SPRITE_TONES: readonly ChipSpriteTone[] = ["red", "blue", "green", "purple", "gold"];
const SPRITE_POSES: readonly ChipSpritePose[] = ["face", "tilted", "stack"];

function Chip({
  tone,
  size,
  tilt,
  seed,
}: {
  tone: ChipTone;
  size: number;
  tilt: number;
  seed: number;
}) {
  const uri = useChipImage({ tone, size, tilt, seed });
  const height = size * Math.cos(tilt) + size * 0.2;
  if (!uri) return <View style={{ width: size, height }} />;
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height }}
      resizeMode="contain"
    />
  );
}

export default function DevChips() {
  if (!__DEV__) return null;
  const tones = Object.keys(chipTones) as ChipTone[];
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.label}>SPRITESHEET — used on the table and splash</Text>
      {SPRITE_POSES.map((pose) => (
        <View key={pose} style={styles.section}>
          <Text style={styles.label}>{pose}</Text>
          {SIZES.map((size) => (
            <View key={size} style={styles.row}>
              {SPRITE_TONES.map((tone) => (
                <ChipSprite key={tone} tone={tone} size={size} pose={pose} />
              ))}
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.label}>PROCEDURAL — previous artwork for comparison</Text>
      {TILTS.map((tilt) => (
        <View key={tilt} style={styles.section}>
          <Text style={styles.label}>tilt {tilt}</Text>
          {SIZES.map((size) => (
            <View key={size} style={styles.row}>
              {tones.map((tone, i) => (
                <Chip key={tone} tone={tone} size={size} tilt={tilt} seed={i} />
              ))}
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.felt },
  content: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.md },
  label: { color: colors.text, fontFamily: fonts.mono },
});
