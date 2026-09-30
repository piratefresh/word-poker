import { Canvas, Picture, createPicture } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

import { generateTableArt } from "./geometry";
import { paintTableArt } from "./paint";

export interface TableArtProps {
  /** The table top's box in points: the rail's outer edge fills it. */
  width: number;
  height: number;
  /** Rail thickness in points across the table's ends; defaults to a share of the table's size. */
  railWidth?: number;
  /** Picks the wood grain and the plank tones. */
  seed?: number;
  /** Places the table top's box; the bands, wall and shadow draw past it. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The painted parlor table (wood rail, gold bands, felt) for a `width` × `height`
 * table top. The drawing is recorded once per size as a Skia picture, so a resize repaints and
 * nothing else does. It is decoration only and never takes a touch.
 */
export function TableArtCanvas({ width, height, railWidth, seed, style }: TableArtProps) {
  const art = useMemo(() => {
    if (!(width > 0 && height > 0)) return null;
    const geometry = generateTableArt(width, height, { railWidth, seed });
    const { bounds } = geometry;
    const picture = createPicture(
      (canvas) => {
        canvas.translate(-bounds.x, -bounds.y);
        paintTableArt(canvas, geometry);
      },
      { width: bounds.width, height: bounds.height },
    );
    return { bounds, picture };
  }, [height, railWidth, seed, width]);

  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      {art ? (
        <Canvas
          style={{
            position: "absolute",
            left: art.bounds.x,
            top: art.bounds.y,
            width: art.bounds.width,
            height: art.bounds.height,
          }}
        >
          <Picture picture={art.picture} />
        </Canvas>
      ) : null}
    </View>
  );
}
