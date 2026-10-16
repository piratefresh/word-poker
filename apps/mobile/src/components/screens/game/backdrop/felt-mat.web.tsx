import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { FeltMatProps } from "./felt-mat-canvas";

export type { FeltMatProps } from "./felt-mat-canvas";

/** Imported only after CanvasKit is ready: the canvas module pulls Skia in as it loads. */
const loadMat = (): Promise<{ default: ComponentType<FeltMatProps> }> =>
  import("./felt-mat-canvas").then(({ FeltMatCanvas }) => ({ default: FeltMatCanvas }));

/** The web mat: `WithSkiaWeb` loads the wasm (`public/canvaskit.wasm`) before mounting it. */
export function FeltMat(props: FeltMatProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadMat}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
