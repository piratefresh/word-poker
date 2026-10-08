/**
 * Jest setup for the mobile package.
 *
 * Reanimated's real entry point installs native worklets on import, which cannot
 * load in Node, so the shipped mock replaces it. Without this every suite that
 * touches an animated component dies inside `react-native-worklets` at import time.
 */
// The mock ships `useReducedMotion` as a TODO; motion stays on unless a suite overrides it.
jest.mock("react-native-reanimated", () => ({
  ...require("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

// The table's mesh-gradient backdrop is Skia, which needs a GPU canvas a test renderer doesn't
// have; it is decoration only, so tests draw nothing in its place.
jest.mock("@/components/screens/game/backdrop/table-backdrop", () => ({ TableBackdrop: () => null }));

// The table's painted rail and felt are Skia too, and decoration only: tests draw no table art.
jest.mock("@/components/table/table-art/table-art", () => ({ TableArt: () => null }));

// The pot bowl is a Rive view, native-only and decoration: tests draw no bowl.
jest.mock("@/components/screens/game/primitives/pot-bowl", () => ({ PotBowl: () => null }));

// The win celebration's Rive view is native-only and decoration (the Continue button is the
// control): tests draw no celebration.
jest.mock("@/components/screens/results/simple-win-result-rive", () => ({
  SimpleWinResultRive: () => null,
}));

// The turn beam around an avatar is a Skia shader, and decoration only: tests see the avatar alone.
jest.mock("@/components/screens/game/primitives/seat-beam", () => ({
  SeatBeam: ({ children }) => children,
}));

// The painted shadow behind the action bar is a Skia shader, and decoration only.
jest.mock("@/components/screens/game/backdrop/action-bar-shade", () => ({ ActionBarShade: () => null }));

// The choice accent's beam is decorative Skia; tests keep the static purple strip.
jest.mock("@/components/game/tile-choice-beam", () => ({
  TileChoiceBeam: ({ color, height }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, { style: { backgroundColor: color, height } });
  },
}));

// Shadows under the tray, racks and tiles are Skia canvases, and decoration only.
jest.mock("@/components/ui/shadow-box", () => ({ ShadowBox: () => null }));

// RevenueCat's SDK is a native module; tests that buy coins mock `@/lib/revenuecat` itself, and this
// keeps anything else that loads the SDK from reaching for a binding Node does not have.
jest.mock("react-native-purchases", () => {
  const Purchases = {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({ customerInfo: {}, created: false })),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null, all: {} })),
    purchasePackage: jest.fn(async () => ({ customerInfo: {}, productIdentifier: "" })),
  };
  return {
    __esModule: true,
    default: Purchases,
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: "1" },
  };
});
