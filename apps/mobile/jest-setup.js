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

jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({
    play: jest.fn(),
    seekTo: jest.fn(async () => {}),
    volume: 1,
  }),
}));

// The tabletop backdrop is drink and coin-bowl art that animates natively, which a test renderer doesn't
// run; it is decoration only, so tests draw nothing in its place.
jest.mock("@/components/screens/game/backdrop/table-backdrop", () => ({ TableBackdrop: () => null }));

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

// The felt mat under the portrait table is Skia decoration: tests see the table without it.
jest.mock("@/components/screens/game/backdrop/felt-mat", () => ({ FeltMat: () => null }));

// The wager button's off-turn glass dome is Skia decoration over a button tests drive directly.
jest.mock("@/components/screens/game/betting/waiting-shield", () => ({ WaitingShield: () => null }));
// Its housing is a Rive view, native-only: tests drive the button over no art.
jest.mock("@/components/screens/game/betting/wager-art", () => ({ WagerArt: () => null }));

// Shadows under the tray, racks and tiles are Skia canvases, and decoration only.
jest.mock("@/components/ui/shadow-box", () => ({ ShadowBox: () => null }));

// RevenueCat's SDK is a native module; tests that buy coins mock `@/lib/wallet/revenuecat` itself, and this
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

// The XP overlay's bar is a Rive view, native-only and decoration: tests read the numbers around it.
jest.mock("@/components/screens/results/xp-bar", () => ({ XpBar: () => null }));
