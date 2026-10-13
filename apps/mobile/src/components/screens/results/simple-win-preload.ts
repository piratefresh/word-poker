import { RiveFileFactory, type RiveFile } from "@rive-app/react-native";

const RIVE_FILE = require("../../../../assets/rive/simplewinscreen.riv");

let file: Promise<RiveFile> | null = null;

/** The winner splash's Rive file, loaded once and shared, so payout does not wait on the decode. */
export function loadSimpleWinFile(): Promise<RiveFile> {
  file ??= RiveFileFactory.fromSource(RIVE_FILE, undefined).catch((error: unknown) => {
    file = null;
    throw error;
  });
  return file;
}

export function preloadSimpleWin(): void {
  void loadSimpleWinFile().catch(() => {});
}
