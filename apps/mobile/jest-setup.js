/**
 * Jest setup for the mobile package.
 *
 * Reanimated's real entry point installs native worklets on import, which cannot
 * load in Node, so the shipped mock replaces it. Without this every suite that
 * touches an animated component dies inside `react-native-worklets` at import time.
 */
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

// The table's mesh-gradient backdrop is Skia, which needs a GPU canvas a test renderer doesn't
// have; it is decoration only, so tests draw nothing in its place.
jest.mock("@/components/screens/game/table-backdrop", () => ({ TableBackdrop: () => null }));

// The tile's pixel-art face is painted by Skia, which Jest has no canvas for: tests see the
// gradient face it falls back to (STO-479).
jest.mock("@/components/game/tile-texture/use-tile-texture", () => ({ useTileTexture: () => null }));
