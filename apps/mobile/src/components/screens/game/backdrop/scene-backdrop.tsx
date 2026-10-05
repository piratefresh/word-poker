import { Image } from "expo-image";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { TavernLight } from "./tavern-light";

// Relative paths keep these bundled assets available to Jest as well as Metro.
const SCENES = {
  tavern: {
    portrait: require("../../../../../assets/images/ui/bgs/bg-tavern-9-16.png"),
    landscape: require("../../../../../assets/images/ui/bgs/bg-tavern-16-9.png"),
  },
  planet: {
    portrait: require("../../../../../assets/images/ui/bgs/bg-planet-9-16.png"),
    landscape: require("../../../../../assets/images/ui/bgs/bg-planet-16-9.png"),
  },
};

/** Full-screen artwork, with Planet dimmed beneath the game's readable chrome. */
export function SceneBackdrop({ look }: { look: keyof typeof SCENES }) {
  const { width, height } = useWindowDimensions();
  const scene = SCENES[look];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        contentFit="cover"
        source={width > height ? scene.landscape : scene.portrait}
        style={StyleSheet.absoluteFill}
        testID={`${look}-backdrop`}
      />
      {look === "tavern" ? <TavernLight landscape={width > height} /> : null}
      {look === "planet" ? <View style={styles.planetShade} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  planetShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
