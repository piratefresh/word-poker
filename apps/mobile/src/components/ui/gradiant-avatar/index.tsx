import React, { memo, useEffect, useMemo } from "react";
import type { ViewStyle } from "react-native";
import { Platform, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { IGradientAvatar } from "./types";
import { buildMesh } from "./utils";

/**
 * A CSS gradient as a style: native takes it as `experimental_backgroundImage`, while
 * react-native-web drops that key and passes the plain CSS `backgroundImage` through.
 */
const meshImage = (image: string): ViewStyle =>
  (Platform.OS === "web"
    ? { backgroundImage: image }
    : { experimental_backgroundImage: image }) as ViewStyle;

/** One full swirl of the mesh while animated; slow enough to read as a drift, not a spinner. */
const SWIRL_MS = 6000;

const GradientAvatar: React.FC<IGradientAvatar> &
  React.FunctionComponent<IGradientAvatar> = memo<IGradientAvatar>(
  ({
    token,
    size = 32,
    rounding,
    palette,
    sheen = true,
    animated = false,
    style,
    children,
  }: IGradientAvatar): React.ReactNode &
    React.ReactElement &
    React.JSX.Element => {
    const { fill, backgroundImage } = useMemo(() => {
      const mesh = buildMesh(token, size, { palette, sheen: false });
      return { fill: mesh.fill, backgroundImage: mesh.layers.join(", ") };
    }, [token, size, palette]);

    // The swirl turns the colour blobs only; the sheen stays put on top so the light keeps
    // coming from the same corner while the mesh moves under it.
    const progress = useSharedValue(0);
    useEffect(() => {
      if (!animated) {
        cancelAnimation(progress);
        progress.value = withTiming(0, { duration: 400 });
        return;
      }
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: SWIRL_MS, easing: Easing.linear }),
        -1,
      );
      return () => cancelAnimation(progress);
    }, [animated, progress]);

    const swirlStyle = useAnimatedStyle(() => ({
      transform: [
        { rotate: `${progress.value * 360}deg` },
        // Breathes twice a turn, so the blobs seem to shift against each other, not just orbit.
        { scale: 1.2 + 0.15 * Math.sin(progress.value * Math.PI * 4) },
      ],
    }));

    const frameStyle: ViewStyle = {
      width: size,
      height: size,
      borderRadius: rounding ?? size / 2,
      backgroundColor: fill,
      overflow: "hidden",
    };

    return (
      <View style={[frameStyle, style]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            meshImage(backgroundImage),
            swirlStyle,
          ]}
        />
        {sheen ? (
          <View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              meshImage(SHEEN),
            ]}
          />
        ) : null}
        {children}
      </View>
    );
  },
);

const SHEEN =
  "linear-gradient(135deg, rgba(255, 255, 255, 0.32) 0%, " +
  "rgba(255, 255, 255, 0.06) 34%, rgba(255, 255, 255, 0) 60%)";

GradientAvatar.displayName = "GradientAvatar";

export { GradientAvatar };
