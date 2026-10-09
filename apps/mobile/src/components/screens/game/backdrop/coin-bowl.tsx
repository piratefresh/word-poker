import { DataBindMode, Fit, RiveView, useRiveFile } from "@rive-app/react-native";
import { useCallback, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { CoinBowlArtwork } from "./coin-bowl-art";
import { type BowlShake, useCoinBowlShake } from "./coin-bowl-motion";

const RIVE_FILE = require("../../../../../assets/images/ui/v2/ambient/coin-bowl-rive-assets/coin-bowl.riv");

export function CoinBowl() {
  const { error, riveFile } = useRiveFile(RIVE_FILE);
  const [riveFailed, setRiveFailed] = useState(false);
  const offset = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }, { rotate: `${offset.value * 0.2}deg` }],
  }));
  const play = useCallback((shake: BowlShake) => {
    const amplitude = shake === "big" ? 4 : 2;
    const step = shake === "big" ? 80 : 55;
    cancelAnimation(offset);
    offset.set(withSequence(
      withTiming(-amplitude, { duration: step }),
      withTiming(amplitude, { duration: step }),
      withTiming(-amplitude * 0.7, { duration: step }),
      withTiming(amplitude * 0.4, { duration: step }),
      withTiming(0, { duration: shake === "big" ? 240 : 160 }),
    ));
  }, [offset]);
  useCoinBowlShake(play);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      {!riveFile || error || riveFailed ? <CoinBowlArtwork /> : (
        <RiveView
          artboardName="CoinBowl"
          autoPlay
          dataBind={DataBindMode.None}
          file={riveFile}
          fit={Fit.Contain}
          onError={() => setRiveFailed(true)}
          stateMachineName="CoinBowlMachine"
          style={StyleSheet.absoluteFill}
        />
      )}
    </Animated.View>
  );
}
