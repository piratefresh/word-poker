import { Image } from "expo-image";
import { StyleSheet, useWindowDimensions, View } from "react-native";

const COIN_BOWL_SHADOW = require("../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-bowl-shadow.png");

const NOTEPAD = require("../../../../../assets/images/ui/v2/ambient/notepad-assets/notepad.png");
const NOTEPAD_SHADOW = require("../../../../../assets/images/ui/v2/ambient/notepad-assets/notepad-shadow.png");

// Relative paths keep these bundled assets available to Jest as well as Metro.
const SCENE = {
  portrait: require("../../../../../assets/images/ui/v2/bgs/tabletop-portrait-6.jpg"),
  landscape: require("../../../../../assets/images/ui/v2/bgs/tabletop-landscape-5.jpg"),
};

/** The tabletop room: full-screen artwork with the drink, coin-bowl shadow and notepad dressed on it. */
export function TableBackdrop() {
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const showDrink = landscape ? height >= 500 : height > 667;
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
    <View style={[StyleSheet.absoluteFill, styles.passive]}>
      <Image
        contentFit="cover"
        source={landscape ? SCENE.landscape : SCENE.portrait}
        style={StyleSheet.absoluteFill}
        testID="tabletop-backdrop"
      />

      {/* {showDrink ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          testID="tabletop-drink"
          style={[
            styles.passive,
            {
              position: "absolute",
              height: drinkSize,
              width: drinkSize,
              // Tucked into the right edge, with more headroom in landscape.
              left: width - drinkSize * 0.78,
              top: height * (landscape ? 0.25 : 0.52),
            },
          ]}
        >
          <Drink />
        </View>
      ) : null} */}
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.coinBowl,
          styles.passive,
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
      {/* <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        testID="tabletop-notepad"
        style={[
          styles.passive,
          {
            position: "absolute",
            height: padSize,
            width: padSize,
            left: -padSize * 0.7,
            top: height * (landscape ? 0.62 : 0.64) - padSize / 2,
          },
        ]}
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
      </View> */}
    </View>
  );
}

const styles = StyleSheet.create({
  // Decoration never takes a touch.
  passive: {
    pointerEvents: "none",
  },
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
});
