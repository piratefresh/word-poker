import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import type { ComponentType } from "react";

import type { TableBackdropProps } from "./mesh-backdrop";
import { isRoomBackdrop, useBackdropStyle } from "./backdrop-style";
import { SceneBackdrop } from "./scene-backdrop";

export type { TableBackdropProps } from "./mesh-backdrop";

/** Imported only after CanvasKit is ready: the gradient's module builds its shader at load. */
const loadBackdrop = (): Promise<{ default: ComponentType<TableBackdropProps> }> =>
  import("./mesh-backdrop").then(({ TableBackdrop }) => ({ default: TableBackdrop }));

/**
 * The web backdrop: `WithSkiaWeb` loads the wasm (served from `public/canvaskit.wasm`) before
 * mounting the mesh gradient. Until then the screen's own gradient shows through.
 */
export function TableBackdrop(props: TableBackdropProps) {
  const chosen = useBackdropStyle();
  // Static artwork can show immediately without waiting for CanvasKit.
  const look = props.look ?? chosen;
  if (isRoomBackdrop(look)) return <SceneBackdrop look={look} />;
  return (
    <WithSkiaWeb
      componentProps={props}
      fallback={null}
      getComponent={loadBackdrop}
      opts={{ locateFile: () => "/canvaskit.wasm" }}
    />
  );
}
