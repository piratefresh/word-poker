/** The night sky behind the online lobby. */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { nightLobby } from "@/constants/theme";

function makeStars() {
  let seed = 7;
  const random = () => {
    seed = (seed * 16_807) % 2_147_483_647;
    return seed / 2_147_483_647;
  };
  return Array.from({ length: 72 }, () => ({
    x: random() * 100,
    y: random() * 100,
    size: random() < 0.12 ? 2.5 : random() < 0.4 ? 1.8 : 1.2,
    opacity: 0.3 + random() * 0.7,
  }));
}

const STARS = makeStars();

export function ParlorBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={nightLobby.sky} end={{ x: 0.5, y: 1 }} start={{ x: 0.5, y: 0 }} style={StyleSheet.absoluteFill} />
      {STARS.map((star, index) => (
        <View
          key={index}
          style={{
            backgroundColor: "#f3ecd0",
            borderRadius: 9,
            height: star.size,
            left: `${star.x}%`,
            opacity: star.opacity,
            position: "absolute",
            top: `${star.y}%`,
            width: star.size,
          }}
        />
      ))}
    </View>
  );
}
