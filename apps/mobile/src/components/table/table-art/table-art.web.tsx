import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { TableArtProps } from "./table-art-canvas";

export type { TableArtProps } from "./table-art-canvas";

/** Imported only after CanvasKit is ready: the painter calls into Skia as soon as it runs. */
const loadTableArt = (): Promise<{ default: ComponentType<TableArtProps> }> =>
  import("./table-art-canvas").then(({ TableArtCanvas }) => ({ default: TableArtCanvas }));

/**
 * The web table: `WithSkiaWeb` loads the wasm (served from `public/canvaskit.wasm`, shared with
 * the backdrop) before mounting the canvas. Until then nothing is drawn under the seats.
 */
export function TableArt(props: TableArtProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadTableArt}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
