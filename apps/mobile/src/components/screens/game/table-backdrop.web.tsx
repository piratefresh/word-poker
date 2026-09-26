import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

/** Imported only after CanvasKit is ready: the gradient's module builds its shader at load. */
const loadBackdrop = (): Promise<{ default: ComponentType<object> }> =>
  import("./mesh-backdrop").then(({ TableBackdrop }) => ({ default: TableBackdrop }));

/**
 * The web backdrop: `WithSkiaWeb` loads the wasm (served from `public/canvaskit.wasm`) before
 * mounting the mesh gradient. Until then the screen's own gradient shows through.
 */
export function TableBackdrop() {
  return (
    <WithSkiaWeb
      fallback={null}
      getComponent={loadBackdrop}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
