import { useId } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { ChipSprite } from "@/components/chip/chip-sprite";
import { fonts } from "@/constants/theme";

/** Separate opaque faces keep the lettering from showing through during the swing. */
export function BookCover({ inside = false }: { inside?: boolean }) {
  const id = useId().replace(/:/g, "");
  return (
    <View style={[styles.face, inside && styles.inside]}>
      <Svg
        pointerEvents="none"
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id={id} cx="35%" cy="25%" r="85%">
            <Stop stopColor={inside ? "#1f6a47" : "#8e4a28"} />
            <Stop offset="55%" stopColor={inside ? "#123f2a" : "#5e2d15"} />
            <Stop offset="100%" stopColor={inside ? "#123f2a" : "#3b1a0b"} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {!inside ? (
        <>
          <View style={styles.spine} />
          <View style={styles.frame}>
            <View style={styles.innerFrame} />
          </View>
          <View style={styles.content}>
            <View>
              <ChipSprite tone="green" size={76} />
              <View style={styles.chipRing}>
                <Text style={styles.club}>♣</Text>
              </View>
            </View>
            <Text style={styles.title}>{"Game History"}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
    backfaceVisibility: "hidden",
    backgroundColor: "#5e2d15",
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  inside: {
    backgroundColor: "#123f2a",
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  spine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 19,
    backgroundColor: "rgba(0,0,0,.25)",
    borderRightWidth: 1,
    borderRightColor: "rgba(255,214,160,.12)",
  },
  frame: {
    position: "absolute",
    top: 64,
    bottom: 150,
    left: 36,
    right: 22,
    borderWidth: 2,
    borderColor: "rgba(242,199,90,.7)",
    borderRadius: 6,
  },
  innerFrame: {
    ...StyleSheet.absoluteFill,
    margin: 7,
    borderWidth: 1,
    borderColor: "rgba(242,199,90,.3)",
    borderRadius: 4,
  },
  content: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    transform: [{ translateX: 18 }, { translateY: -110 }],
  },
  chipRing: {
    position: "absolute",
    top: 15,
    left: 15,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: "#d4a24c",
    backgroundColor: "#2f7a4a",
    alignItems: "center",
    justifyContent: "center",
  },
  club: { fontSize: 33, lineHeight: 40, color: "#f2c75a" },
  title: {
    fontFamily: fonts.arcade,
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: 3.04,
    color: "#f2c75a",
    textAlign: "center",
    textShadowColor: "#2a1206",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
});
