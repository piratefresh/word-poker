import { RuntimeLoader } from "@rive-app/canvas";
import { Asset } from "expo-asset";

const RIVE_FILE = require("../../../../assets/rive/simplewinscreen.riv");

/** Warm the Rive WASM runtime and the splash's `.riv` in the browser cache before payout. */
export function preloadSimpleWin(): void {
  RuntimeLoader.getInstance(() => {});
  void fetch(Asset.fromModule(RIVE_FILE).uri).catch(() => {});
}
