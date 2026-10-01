import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

export type ChipSpriteTone = "red" | "blue" | "green" | "purple" | "gold";
export type ChipSpritePose = "face" | "tilted" | "stack";

const SHEET = require("../../../assets/images/ui/chips-transparent.png");
const SHEET_SIZE = 1254;
const ROW: Record<ChipSpriteTone, number> = {
  red: 0,
  blue: 1,
  green: 2,
  purple: 3,
  gold: 4,
};
// The transparent copy keeps the poses but has slightly different spacing between stack rows.
const FRAMES: Record<ChipSpritePose, {
  x: number;
  y: readonly number[];
  width: number;
  height: number;
}> = {
  face: { x: 18, y: [38, 273, 508, 743, 978], width: 198, height: 198 },
  tilted: { x: 234, y: [55, 290, 525, 761, 996], width: 193, height: 174 },
  stack: { x: 1060, y: [38, 267, 504, 737, 976], width: 179, height: 198 },
};

/** A clipped region of the shared atlas; decorative artwork, with amounts owned by the caller. */
export function ChipSprite({
  tone = "gold",
  size,
  pose = "face",
}: {
  tone?: ChipSpriteTone;
  /** Width in points; the pose keeps its own aspect ratio. */
  size: number;
  pose?: ChipSpritePose;
}) {
  const frame = FRAMES[pose];
  const scale = size / frame.width;
  return (
    <View
      pointerEvents="none"
      style={[styles.clip, { width: size, height: frame.height * scale }]}
    >
      <Image
        source={SHEET}
        accessible={false}
        contentFit="fill"
        cachePolicy="memory-disk"
        style={{
          position: "absolute",
          width: SHEET_SIZE * scale,
          height: SHEET_SIZE * scale,
          left: -frame.x * scale,
          top: -(frame.y[ROW[tone]] ?? 0) * scale,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
