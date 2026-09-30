import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { TimerGlassProps } from "./timer-glass-canvas";

export type { TimerGlassProps } from "./timer-glass-canvas";

/** Imported only after CanvasKit is ready: the glass builds its outline as soon as it renders. */
const loadTimerGlass = (): Promise<{ default: ComponentType<TimerGlassProps> }> =>
  import("./timer-glass-canvas").then(({ TimerGlassCanvas }) => ({ default: TimerGlassCanvas }));

/**
 * The web glass: `WithSkiaWeb` loads the wasm (served from `public/canvaskit.wasm`, shared with the
 * table art) before mounting the canvas. Until then the banner's own picture shows its dark glass.
 */
export function TimerGlass(props: TimerGlassProps) {
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadTimerGlass}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
