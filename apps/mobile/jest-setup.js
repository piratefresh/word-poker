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

// The table's painted rail and felt are Skia too, and decoration only: tests draw no table art.
jest.mock("@/components/table/table-art/table-art", () => ({ TableArt: () => null }));

// The turn beam around an avatar is a Skia shader, and decoration only: tests see the avatar alone.
jest.mock("@/components/screens/game/seat-beam", () => ({
  SeatBeam: ({ children }) => children,
}));

// The light in the phase banner's clock glass is Skia, and decoration over the painted plate:
// tests see the plate and its digits alone.
jest.mock("@/components/hud/top-bar/timer-glass", () => ({ TimerGlass: () => null }));

// The painted shadow behind the action bar is a Skia shader, and decoration only.
jest.mock("@/components/screens/game/action-bar-shade", () => ({ ActionBarShade: () => null }));

// The tile's pixel-art face is painted by Skia, which Jest has no canvas for: tests see the
// gradient face it falls back to (STO-479).
jest.mock("@/components/game/tile-texture/use-tile-texture", () => ({ useTileTexture: () => null }));

// The choice accent's beam is decorative Skia; tests keep the static purple strip.
jest.mock("@/components/game/tile-choice-beam", () => ({
  TileChoiceBeam: ({ color, height }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { style: { backgroundColor: color, height } });
  },
}));
