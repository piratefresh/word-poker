import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

const ART = {
  looseBack: require(
    "../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-loose-back.png",
  ),
  bowl: require("../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-bowl.png"),
  pile: require("../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-pile.png"),
  looseFront: require(
    "../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-loose-front.png",
  ),
};

/** Static artwork while Rive loads or if its runtime fails. */
export function CoinBowlArtwork() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image
        accessible={false}
        contentFit="contain"
        source={ART.looseBack}
        style={styles.looseBack}
      />
      <Image
        accessible={false}
        contentFit="contain"
        source={ART.bowl}
        style={styles.bowl}
      />
      <Image
        accessible={false}
        contentFit="fill"
        source={ART.pile}
        style={styles.pile}
      />
      <Image
        accessible={false}
        contentFit="contain"
        source={ART.looseFront}
        style={styles.looseFront}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  looseBack: {
    height: "21.4%",
    left: "3%",
    position: "absolute",
    top: "45%",
    width: "35%",
  },
  bowl: {
    height: "55.6%",
    left: "10.6%",
    position: "absolute",
    top: "22.2%",
    width: "78.8%",
  },
  pile: {
    height: "31%",
    left: "17.5%",
    position: "absolute",
    top: "24.5%",
    width: "65%",
  },
  looseFront: {
    height: "24.6%",
    left: "48%",
    position: "absolute",
    top: "55%",
    width: "43.7%",
  },
});
