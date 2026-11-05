import { Image, type ImageSource } from "expo-image";
import type { ReactElement } from "react";
import { StyleSheet, View } from "react-native";

/** Where a portrait's face sits in its frame, as fractions of its width and height. */
const FACE_CENTRE = { x: 0.5, y: 0.58 };
/** How far the portrait is drawn past the circle, so only the face and its hair line show. */
const ZOOM = 1.45;
/** The kit's heads are 500 × 565. */
const ASPECT = 565 / 500;

/** A head-and-shoulders portrait cropped to a circular avatar of `size`: the face, centred, with the hair cut off by the rim. */
export function AvatarArt({ source, size }: { source: ImageSource | number; size: number }): ReactElement {
  const width = size * ZOOM;
  const height = width * ASPECT;
  return (
    <View pointerEvents="none" style={[styles.clip, { borderRadius: size / 2, height: size, width: size }]}>
      <Image
        accessible={false}
        contentFit="fill"
        source={source}
        style={{ height, left: size / 2 - FACE_CENTRE.x * width, position: "absolute", top: size / 2 - FACE_CENTRE.y * height, width }}
      />
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: "hidden" } });
