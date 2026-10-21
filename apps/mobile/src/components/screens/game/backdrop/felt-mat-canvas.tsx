import {
  Canvas,
  DashPathEffect,
  Group,
  Image,
  RadialGradient,
  RoundedRect,
  Shadow,
  useImage,
  vec,
} from "@shopify/react-native-skia";

import { MAT, type MatBox } from "./felt-mat-box";

const FELT = require("../../../../../assets/images/ui/v2/felt-mat.jpg");

export interface FeltMatProps {
  /** The screen the canvas covers. */
  width: number;
  height: number;
  box: MatBox;
  tilt?: number;
}

/** The felt mat on the wood: a soft shadow, the felt cropped to cover, a darker rim, a stitch. */
export function FeltMatCanvas({ width, height, box, tilt = MAT.tilt }: FeltMatProps) {
  const felt = useImage(FELT);
  const { x, y, width: w, height: h } = box;
  const centre = vec(x + w / 2, y + h / 2);
  const inset = MAT.stitch;
  return (
    // One style object: the web Canvas hands it to a DOM node, which takes no arrays.
    <Canvas pointerEvents="none" style={{ height, left: 0, position: "absolute", top: 0, width }}>
      <Group origin={centre} transform={[{ rotate: (tilt * Math.PI) / 180 }]}>
        <RoundedRect color="#14301f" height={h} r={MAT.radius} width={w} x={x} y={y}>
          <Shadow blur={14} color="rgba(20,8,2,0.6)" dx={0} dy={8} />
        </RoundedRect>
        <Group clip={{ rect: { x, y, width: w, height: h }, rx: MAT.radius, ry: MAT.radius }}>
          {felt ? <Image fit="cover" height={h} image={felt} width={w} x={x} y={y} /> : null}
          {/* The rim darkens so the middle reads as the focal point. */}
          <RoundedRect height={h} r={MAT.radius} width={w} x={x} y={y}>
            <RadialGradient
              c={centre}
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(0,12,4,0.45)"]}
              positions={[0, 0.55, 1]}
              r={Math.hypot(w, h) / 2}
            />
          </RoundedRect>
        </Group>
        <RoundedRect
          color="rgba(214,182,104,0.55)"
          height={h - inset * 2}
          r={MAT.radius - inset}
          strokeWidth={1.5}
          style="stroke"
          width={w - inset * 2}
          x={x + inset}
          y={y + inset}
        >
          <DashPathEffect intervals={[8, 6]} />
        </RoundedRect>
      </Group>
    </Canvas>
  );
}
