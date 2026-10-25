import {
  Canvas,
  Group,
  LinearGradient,
  Rect,
  RoundedRect,
  Shadow,
  vec,
} from "@shopify/react-native-skia";

import { HOLDER } from "./rack-holder-box";

export interface RackHolderProps {
  width: number;
  /** The tiles' height: the back wall rises behind them and the ledge runs under them. */
  tileHeight: number;
}

/**
 * A tile rack like a Scrabble tray: a back wall the tiles lean on and a ledge they stand on, in
 * wood, with a groove between where the tiles sit. Drawn behind the tiles, so they stand in it.
 * The texture overlay goes over the `Group` below.
 */
export function RackHolderCanvas({ width, tileHeight }: RackHolderProps) {
  const w = width + HOLDER.side * 2;
  const h = HOLDER.top + tileHeight + HOLDER.ledge;
  const ledgeTop = HOLDER.top + tileHeight - 2;
  return (
    <Canvas
      pointerEvents="none"
      style={{
        height: h,
        left: -HOLDER.side,
        position: "absolute",
        top: -HOLDER.top,
        width: w,
      }}
    >
      <Group>
        {/* The back wall: lit from the top edge, falling dark where the tiles stand against it. */}
        <RoundedRect color="#8a5326" height={h - 6} r={8} width={w} x={0} y={0}>
          <LinearGradient
            colors={["#c48a4e", "#a2692f", "#6e4120"]}
            end={vec(0, h - 6)}
            start={vec(0, 0)}
          />
          <Shadow blur={6} color="rgba(10,4,0,0.55)" dx={0} dy={5} />
        </RoundedRect>
        <Rect color="rgba(255,226,170,0.45)" height={1.5} width={w - 16} x={8} y={1} />
        {/* The groove at the foot of the wall. */}
        <Rect color="rgba(20,8,0,0.55)" height={3} width={w} x={0} y={ledgeTop - 3} />
        {/* The ledge in front, a step lighter than the wall so it reads as the nearer face. */}
        <RoundedRect color="#b87a3c" height={HOLDER.ledge + 4} r={6} width={w} x={0} y={ledgeTop}>
          <LinearGradient
            colors={["#d9a05f", "#b87a3c", "#8a5a2a"]}
            end={vec(0, h)}
            start={vec(0, ledgeTop)}
          />
        </RoundedRect>
        <Rect color="rgba(255,236,196,0.55)" height={1.5} width={w - 12} x={6} y={ledgeTop + 1} />
      </Group>
    </Canvas>
  );
}
