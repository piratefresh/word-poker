import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";
import { useReducedMotion } from "react-native-reanimated";

import type { SeatBeamProps } from "./seat-beam-canvas";

export type { SeatBeamProps } from "./seat-beam-canvas";

/** Imported only after CanvasKit is ready: the beam builds its shader as soon as it loads. */
const loadSeatBeam = (): Promise<{ default: ComponentType<SeatBeamProps> }> =>
  import("./seat-beam-canvas").then(({ SeatBeamCanvas }) => ({ default: SeatBeamCanvas }));

/**
 * The web beam: `WithSkiaWeb` loads the wasm (served from `public/canvaskit.wasm`, shared with the
 * table art) before mounting the shader. Until then, and whenever no turn is running, the avatar
 * draws on its own.
 */
export function SeatBeam(props: SeatBeamProps) {
  const reduceMotion = useReducedMotion();
  if (!props.active || reduceMotion) return <>{props.children}</>;
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={<>{props.children}</>}
      getComponent={loadSeatBeam}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
