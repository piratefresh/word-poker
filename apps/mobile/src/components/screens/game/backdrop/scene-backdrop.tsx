import { Image } from "expo-image";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { Drink } from "./drink";
import { TavernLight } from "./tavern-light";

const COIN_BOWL_SHADOW = require("../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-bowl-shadow.png");

const NOTEPAD = require("../../../../../assets/images/ui/v2/ambient/notepad-assets/notepad.png");
const NOTEPAD_SHADOW = require("../../../../../assets/images/ui/v2/ambient/notepad-assets/notepad-shadow.png");

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
  tabletop: {
    portrait: require("../../../../../assets/images/ui/v2/bgs/tabletop-portrait-5.jpg"),
    landscape: require("../../../../../assets/images/ui/v2/bgs/tabletop-landscape-4.jpg"),
  },
};

/** Full-screen artwork, with Planet dimmed beneath the game's readable chrome. */
export function SceneBackdrop({ look }: { look: keyof typeof SCENES }) {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const scene = SCENES[look];
  const bowlSize = landscape
    ? Math.min(width * 0.25, height * 0.55)
    : Math.min(width * 0.62, height * 0.3);
  const drinkSize = landscape
    ? Math.min(width * 0.22, height * 0.42)
    : Math.min(width * 0.4, height * 0.23);
  const padSize = landscape
    ? Math.min(width * 0.2, height * 0.4)
    : Math.min(width * 0.5, height * 0.28);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        contentFit="cover"
        source={landscape ? scene.landscape : scene.portrait}
        style={StyleSheet.absoluteFill}
        testID={`${look}-backdrop`}
      />

      {look === "tabletop" ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          testID="tabletop-drink"
          style={{
            position: "absolute",
            height: drinkSize,
            width: drinkSize,
            left: -drinkSize * 0.25,
            top: -drinkSize * 0.08,
          }}
        >
          <Drink />
        </View>
      ) : null}
      {look === "tabletop" ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[
            styles.coinBowl,
            {
              height: bowlSize,
              left: landscape ? -bowlSize * 0.5 : -bowlSize * 0.72,
              top: height * (landscape ? 0.22 : 0.32),
              width: bowlSize,
            },
          ]}
        >
          {/* Extend the cast shadow into the room: the bowl's left edge is cropped offscreen. */}
          <Image
            accessible={false}
            contentFit="fill"
            source={COIN_BOWL_SHADOW}
            style={styles.bowlCastShadow}
            tintColor="#241208"
          />
          <Image
            accessible={false}
            contentFit="fill"
            source={COIN_BOWL_SHADOW}
            style={styles.bowlContactShadow}
            tintColor="#160c07"
          />
          {/* <CoinBowl /> */}
        </View>
      ) : null}
      {look === "tabletop" ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          testID="tabletop-notepad"
          style={{
            position: "absolute",
            height: padSize,
            width: padSize,
            left: -padSize * 0.7,
            top: height * (landscape ? 0.62 : 0.64) - padSize / 2,
          }}
        >
          <Image
            accessible={false}
            contentFit="contain"
            source={NOTEPAD_SHADOW}
            style={StyleSheet.absoluteFill}
            tintColor="#160c07"
          />
          <Image
            accessible={false}
            contentFit="contain"
            source={NOTEPAD}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : null}
      {look === "tavern" ? <TavernLight landscape={landscape} /> : null}
      {look === "planet" ? <View style={styles.planetShade} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  coinBowl: {
    position: "absolute",
    zIndex: 1,
  },
  bowlCastShadow: {
    height: "26%",
    left: "15%",
    opacity: 0.85,
    position: "absolute",
    top: "65%",
    width: "94%",
  },
  bowlContactShadow: {
    height: "12%",
    left: "16%",
    opacity: 0.95,
    position: "absolute",
    top: "69%",
    width: "74%",
  },
  planetShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
