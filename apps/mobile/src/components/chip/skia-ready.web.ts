import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

let ready: Promise<void> | null = null;

/** On the web, Skia is CanvasKit: load the wasm from `public/canvaskit.wasm` once. */
export function skiaReady(): Promise<void> {
  ready ??= LoadSkiaWeb({ locateFile: () => "/canvaskit.wasm" });
  return ready;
}
