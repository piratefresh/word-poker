import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { ShadowBoxProps } from "./shadow-box-canvas";

export type { ShadowBoxProps, ShadowSpec } from "./shadow-box-canvas";

/** Imported only after CanvasKit is ready (wasm served from `public/canvaskit.wasm`). */
const load = (): Promise<{ default: ComponentType<ShadowBoxProps> }> =>
  import("./shadow-box-canvas").then(({ ShadowBoxCanvas }) => ({ default: ShadowBoxCanvas }));

export function ShadowBox(props: ShadowBoxProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={load}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
