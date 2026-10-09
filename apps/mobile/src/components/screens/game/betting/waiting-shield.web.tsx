import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { WaitingShieldProps } from "./waiting-shield-canvas";

export type { WaitingShieldProps } from "./waiting-shield-canvas";

/** Imported only after CanvasKit is ready: the canvas module pulls Skia in as it loads. */
const loadShield = (): Promise<{ default: ComponentType<WaitingShieldProps> }> =>
  import("./waiting-shield-canvas").then(({ WaitingShieldCanvas }) => ({ default: WaitingShieldCanvas }));

/** The web shield: `WithSkiaWeb` loads the wasm (`public/canvaskit.wasm`) before mounting it. */
export function WaitingShield(props: WaitingShieldProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadShield}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
