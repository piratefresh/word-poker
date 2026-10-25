import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { RackHolderProps } from "./rack-holder-canvas";

export type { RackHolderProps } from "./rack-holder-canvas";

/** Imported only after CanvasKit is ready: the canvas module pulls Skia in as it loads. */
const loadHolder = (): Promise<{ default: ComponentType<RackHolderProps> }> =>
  import("./rack-holder-canvas").then(({ RackHolderCanvas }) => ({ default: RackHolderCanvas }));

/** The web holder: `WithSkiaWeb` loads the wasm (`public/canvaskit.wasm`) before mounting it. */
export function RackHolder(props: RackHolderProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadHolder}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
