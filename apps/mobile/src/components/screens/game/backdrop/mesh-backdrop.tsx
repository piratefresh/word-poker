import {
  Canvas,
  ColorMatrix,
  Fill,
  ImageShader,
  useImage,
} from "@shopify/react-native-skia";
import { StyleSheet, useWindowDimensions } from "react-native";

import { AnimatedMeshGradient } from "@/components/table/mesh-gradiant";
import type { IAnimatedMeshGradient } from "@/components/table/mesh-gradiant/types";

import {
  isRoomBackdrop,
  useBackdropStyle,
  useBackdropUrgency,
  type BackdropStyle,
} from "./backdrop-style";
import { TableAtmosphere } from "./table-atmosphere";
import { SceneBackdrop } from "./scene-backdrop";

type BackdropLook = Pick<
  IAnimatedMeshGradient,
  "blur" | "colors" | "contrast" | "noise" | "painted" | "speed"
>;

/**
 * Emerald: dark felt under slow-moving light — shadow green, dark teal, the emerald glow and a
 * muted green, finished by the shader's vignette, centre hotspot and painted strokes. The drift is
 * slow on purpose: the table, seats and tiles are the actors, the light only moves behind.
 */
const EMERALD: BackdropLook = {
  blur: 0.7,
  colors: [
    { r: 1 / 255, g: 29 / 255, b: 27 / 255 },
    { r: 2 / 255, g: 48 / 255, b: 42 / 255 },
    { r: 0 / 255, g: 78 / 255, b: 62 / 255 },
    { r: 4 / 255, g: 57 / 255, b: 48 / 255 },
  ],
  contrast: 0.5,
  noise: 0.18,
  painted: true,
  speed: 0.4,
};

/**
 * Ember: deep greens drifting under a low ember of gold, tuned as in the Reacticx docs but for
 * the noise. The shader caps noise at 1, which is full-strength per-frame grain and a mottled warp;
 * drawn undersampled across a desktop window that reads as static, so it is kept low.
 */
const EMBER: BackdropLook = {
  blur: 1.5,
  colors: [
    { r: 0.02, g: 0.08, b: 0.06 },
    { r: 0.05, g: 0.23, b: 0.18 },
    { r: 0.1, g: 0.29, b: 0.21 },
    { r: 0.3, g: 0.22, b: 0.08 },
  ],
  contrast: 0.5,
  noise: 0.3,
  painted: false,
  speed: 1,
};

const MESH_LOOKS: Partial<Record<BackdropStyle, BackdropLook>> = {
  emerald: EMERALD,
  ember: EMBER,
};

// Relative, not `@/assets`: Jest maps `@/` to `src/` only.
/** The repeatable pictures, tiled across the room rather than stretched over it. */
const TILED_LOOKS: Partial<Record<BackdropStyle, number>> = {
  fire: require("../../../../../assets/images/ui/bgs/bg-fire-2.png"),
  wood: require("../../../../../assets/images/ui/bgs/bg-wood.png"),
  water: require("../../../../../assets/images/ui/bgs/bg-water.png"),
};
/** Every picture is 941 × 1672; a tile is drawn at this share of that, in points. */
const TILE_SCALE = 0.25;

/** How many times its calm speed a look drifts at when the turn clock runs out. */
const URGENT_SPEED_FACTOR = 5;

/**
 * The look's speed for a turn that has spent `urgency` of its budget: calm for most of the turn,
 * then climbing steeply toward the end, so the light only hurries when time is actually short.
 */
function driftSpeed(calm: number, urgency: number): number {
  const spent = Math.max(0, Math.min(1, urgency));
  return calm * (1 + (URGENT_SPEED_FACTOR - 1) * spent ** 3);
}

export interface TableBackdropProps {
  /** Draws this look whatever the session has chosen (the table's gear picks that one). */
  look?: BackdropStyle;
}

/**
 * The animated mesh gradient behind the offline and online table, filling its parent, with the
 * room's atmosphere — vignette, grain, edge haze — laid over it and under the table. Its drift
 * quickens as the turn clock runs down.
 */
export function TableBackdrop({ look }: TableBackdropProps) {
  const chosen = useBackdropStyle();
  const style = look ?? chosen;
  if (isRoomBackdrop(style)) return <SceneBackdrop look={style} />;
  const tiled = TILED_LOOKS[style];
  return (
    <>
      {tiled === undefined ? (
        <MeshBackdrop look={MESH_LOOKS[style] ?? EMERALD} />
      ) : (
        <TiledBackdrop source={tiled} />
      )}
      <TableAtmosphere />
    </>
  );
}

function MeshBackdrop({ look }: { look: BackdropLook }) {
  const speed = driftSpeed(look.speed ?? 1, useBackdropUrgency());
  return (
    <>
      <AnimatedMeshGradient
        {...look}
        speed={speed}
        style={StyleSheet.absoluteFill}
      />
      <TextureOverlay />
    </>
  );
}

// Relative, not `@/assets`: Jest maps `@/` to `src/` only.
const TEXTURE = require("../../../../../assets/images/ui/bgs/bg-texture.png");

/** How hard the texture's light areas show through; its dark areas are left fully clear. */
const TEXTURE_GAIN = 0.4;
/** The colour the texture's light areas are painted in: a pale green, so they read as lit felt. */
const TEXTURE_TINT = { b: 0.5, g: 0.65, r: 0.4 };
// prettier-ignore
/** Luminance → alpha, constant tint for colour: the grey picture becomes light mottling on clear. */
const TEXTURE_MATRIX = [
  0, 0, 0, 0, TEXTURE_TINT.r,
  0, 0, 0, 0, TEXTURE_TINT.g,
  0, 0, 0, 0, TEXTURE_TINT.b,
  0.3 * TEXTURE_GAIN, 0.6 * TEXTURE_GAIN, 0.1 * TEXTURE_GAIN, 0, 0,
];

/**
 * The grunge texture laid over the gradient, cover-fitted to the window. Skia blends within one
 * canvas only, so instead of a blend mode the picture is turned into a tinted alpha mask: the
 * gradient's colour stays, and the texture only adds light where it is light.
 */
function TextureOverlay() {
  const image = useImage(TEXTURE);
  const { height, width } = useWindowDimensions();
  if (!image) return null;
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <ImageShader
          fit="cover"
          height={height}
          image={image}
          width={width}
          x={0}
          y={0}
        />
        <ColorMatrix matrix={TEXTURE_MATRIX} />
      </Fill>
    </Canvas>
  );
}

/** A repeatable picture tiled edge to edge. Nothing draws until it has loaded. */
function TiledBackdrop({ source }: { source: number }) {
  const image = useImage(source);
  if (!image) return null;
  const tile = {
    height: image.height() * TILE_SCALE,
    width: image.width() * TILE_SCALE,
    x: 0,
    y: 0,
  };
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Fill>
        <ImageShader
          fit="fill"
          image={image}
          rect={tile}
          tx="repeat"
          ty="repeat"
        />
      </Fill>
    </Canvas>
  );
}
