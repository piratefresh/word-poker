import { Image } from "expo-image";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { useBackdropStyle } from "../screens/game/backdrop-style";

/**
 * The painted parlor table (wood rail, gold bands, slate stones, felt), scaled as one picture: it
 * keeps the art's own shape and detail at every size, where a drawn table would have to re-invent
 * the painting's texture to hold up on a large screen.
 *
 * The layout box is the oval rail's outer edge inside the picture; only its shadowed lip reaches
 * past it. The seats sit inside that box: their avatars on the felt, their labels free to ride the
 * rail (`placeSeatsOnFelt`).
 */
// Relative, not `@/assets`: Jest maps `@/` to `src/` only.
const SOURCE = require("../../../assets/images/ui/table/circular table/table-14.png");
/**
 * The water room's table: an opaque picture on black, so it is cropped to its rail, stretched into
 * the same table-top box and clipped to the oval. Its felt sits at nearly the same shares of the
 * rail as table-9's, so the seats keep `TABLE_FELT`.
 */
const WATER = {
  source: require("../../../assets/images/ui/table/circular table/table-water.png"),
  image: { width: 1088, height: 608 },
  /** The rail's outer edge, in the picture's pixels. */
  top: { x: 94, y: 10, width: 892, height: 570 },
};

/** The picture, in its own pixels. */
const IMAGE = { width: 1448, height: 1086 };
/** The rail's outer top edge — the box the seats sit around — in the picture's pixels. */
const TOP = { x: 40, y: 75, width: 1368, height: 935 };
/** Everything painted (the rest of the picture is transparent), in the picture's pixels. */
const PAINTED = { left: 36, top: 70, right: 1412, bottom: 1016 };
/** The green inside the gold band, in the picture's pixels. */
const CLOTH = { left: 137, top: 157, right: 1306, bottom: 889 };

/** The table top's width over its height: the only shape the picture comes in. */
export const TABLE_ASPECT = TOP.width / TOP.height;

/**
 * How far the painting reaches past the table top's box on each side, as shares of the box's
 * height: the far stone above, the side stones left and right, the wall and near stone below.
 */
export const TABLE_REACH = {
  top: (TOP.y - PAINTED.top) / TOP.height,
  side:
    Math.max(TOP.x - PAINTED.left, PAINTED.right - (TOP.x + TOP.width)) /
    TOP.height,
  bottom: (PAINTED.bottom - (TOP.y + TOP.height)) / TOP.height,
} as const;

/** An ellipse by its centre and radii, as shares of the table top's width (x) and height (y). */
export interface NormEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** The rail's outer edge: the oval that fills the table top's box. */
export const TABLE_RAIL: NormEllipse = { cx: 0.5, cy: 0.5, rx: 0.5, ry: 0.5 };

/** The felt inside the rail's gold band — the playing surface a seat's avatar sits on. */
export const TABLE_FELT: NormEllipse = {
  cx: ((CLOTH.left + CLOTH.right) / 2 - TOP.x) / TOP.width,
  cy: ((CLOTH.top + CLOTH.bottom) / 2 - TOP.y) / TOP.height,
  rx: (CLOTH.right - CLOTH.left) / 2 / TOP.width,
  ry: (CLOTH.bottom - CLOTH.top) / 2 / TOP.height,
};

export interface TableImageProps {
  /** The table top's width in points; its height follows from `TABLE_ASPECT`. */
  width: number;
  /** Places the table top's box; the painting draws past it by `TABLE_REACH`. */
  style?: StyleProp<ViewStyle>;
}

/** The painted table for a table top `width` points wide. Decoration only; never takes a touch. */
export function TableImage({ width, style }: TableImageProps) {
  const water = useBackdropStyle() === "water";
  const scale = width / TOP.width;
  if (water) {
    const height = TOP.height * scale;
    const sx = width / WATER.top.width;
    const sy = height / WATER.top.height;
    return (
      <View
        pointerEvents="none"
        style={[
          { width, height, borderRadius: "50%", overflow: "hidden" },
          style,
        ]}
      >
        <Image
          contentFit="fill"
          source={WATER.source}
          style={{
            position: "absolute",
            left: -WATER.top.x * sx,
            top: -WATER.top.y * sy,
            width: WATER.image.width * sx,
            height: WATER.image.height * sy,
          }}
        />
      </View>
    );
  }
  return (
    <View
      pointerEvents="none"
      style={[{ width, height: TOP.height * scale }, style]}
    >
      <Image
        contentFit="fill"
        source={SOURCE}
        style={{
          position: "absolute",
          left: -TOP.x * scale,
          top: -TOP.y * scale,
          width: IMAGE.width * scale,
          height: IMAGE.height * scale,
        }}
      />
    </View>
  );
}
