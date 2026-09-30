import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { ActionBarShadeProps } from "./action-bar-shade-canvas";

export type { ActionBarShadeProps } from "./action-bar-shade-canvas";

/** Imported only after CanvasKit is ready: the shade builds its shader as soon as it renders. */
const loadShade = (): Promise<{ default: ComponentType<ActionBarShadeProps> }> =>
  import("./action-bar-shade-canvas").then(({ ActionBarShadeCanvas }) => ({
    default: ActionBarShadeCanvas,
  }));

/** The web shade: `WithSkiaWeb` loads the wasm (`public/canvaskit.wasm`) before mounting the canvas. */
export function ActionBarShade(props: ActionBarShadeProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadShade}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
