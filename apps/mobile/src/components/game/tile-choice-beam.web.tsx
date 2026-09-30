import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import type { TileChoiceBeamProps } from "./tile-choice-beam-canvas";

export type { TileChoiceBeamProps } from "./tile-choice-beam-canvas";

/** The shader module must load after CanvasKit is ready. */
const loadTileChoiceBeam = (): Promise<{ default: ComponentType<TileChoiceBeamProps> }> =>
  import("./tile-choice-beam-canvas").then(({ TileChoiceBeamCanvas }) => ({
    default: TileChoiceBeamCanvas,
  }));

export function TileChoiceBeam(props: TileChoiceBeamProps) {
  const reduceMotion = useReducedMotion();
  const fallback = <View style={{ backgroundColor: props.color, height: props.height }} />;
  if (!props.active || reduceMotion) return fallback;
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={fallback}
      getComponent={loadTileChoiceBeam}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
