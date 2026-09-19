/**
 * Jest setup for the mobile package.
 *
 * Reanimated's real entry point installs native worklets on import, which cannot
 * load in Node, so the shipped mock replaces it. Without this every suite that
 * touches an animated component dies inside `react-native-worklets` at import time.
 */
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
