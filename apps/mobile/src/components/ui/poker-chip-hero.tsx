import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ChipSprite } from "@/components/chip/chip-sprite";

import { useReduceMotion } from "@/components/hud/use-reduce-motion";

export type PokerChipHeroSize = "sm" | "md" | "lg" | "xl";
export type PokerChipHeroTone = "gold" | "red" | "blue" | "green" | "purple";

export type PokerChipHeroProps = {
  size?: PokerChipHeroSize;
  tone?: PokerChipHeroTone;
  spinning?: boolean;
};

/** The web kit's geometry: `h-7 w-7` … `h-24 w-24`, keeping the splash layout stable. */
const SIZE_PX: Record<PokerChipHeroSize, number> = { sm: 28, md: 40, lg: 64, xl: 96 };
/** The web's `animate-spin` cadence, and its reduced-motion override. */
const SPIN_MS = 1000;
const SPIN_MS_REDUCED = 1500;

export function PokerChipHero({ size = "md", tone = "gold", spinning = false }: PokerChipHeroProps) {
  const reduceMotion = useReduceMotion();
  const box = SIZE_PX[size];

  const rotation = useSharedValue(0);
  useEffect(() => {
    if (spinning) {
      rotation.value = withRepeat(
        withTiming(360, {
          duration: reduceMotion ? SPIN_MS_REDUCED : SPIN_MS,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
  }, [spinning, reduceMotion, rotation]);

  const spin = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View
      style={[
        styles.shadow,
        {
          width: box,
          height: box,
          borderRadius: box / 2,
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, spin]}>
        <ChipSprite tone={tone} size={box} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
});
