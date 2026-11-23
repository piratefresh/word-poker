import { loadFont as loadFredoka } from "@remotion/google-fonts/Fredoka";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadLilita } from "@remotion/google-fonts/LilitaOne";

/**
 * The app's tokens (apps/mobile/src/constants/theme.ts), copied rather than imported: the trailer
 * sits outside the pnpm workspace so it never adds a dependency to the app.
 */
export const C = {
  felt800: "#051410",
  felt600: "#0a1d17",
  felt500: "#0d3b2e",
  felt400: "#1a4a35",
  table: ["#2f5418", "#1d3711", "#0e1d09"],
  gold600: "#7e5e16",
  gold500: "#9c7620",
  gold300: "#d4a54a",
  gold200: "#e7c75a",
  gold100: "#f7df7a",
  cream100: "#f4e4c1",
  cream200: "#e8dcc0",
  textDim: "rgba(232,220,192,0.62)",
  border: "rgba(212,175,55,0.45)",
  tileHi: "#fff6e2",
  tileLo: "#f0dbb2",
  tileEdge: "#b99a68",
  tileInk: "#2b1810",
  onGold: "#1a1208",
  players: ["#e6b450", "#7ec4cf", "#9ec27a", "#a78bfa", "#f0a8c0"],
} as const;

export const CHIPS = {
  red: { base: "#b3241f", light: "#dc4a3c", dark: "#5e1210", inset: "#ecd9b4", ring: "#d9a441" },
  blue: { base: "#1d4f9c", light: "#3b7acb", dark: "#0b2a57", inset: "#ecd9b4", ring: "#d9a441" },
  green: { base: "#11704a", light: "#2c9a68", dark: "#06402a", inset: "#ecd9b4", ring: "#d9a441" },
  black: { base: "#2a2824", light: "#4f4a41", dark: "#11100e", inset: "#e6d3ae", ring: "#d9a441" },
  gold: { base: "#c9983f", light: "#efc86e", dark: "#7a561c", inset: "#f3e2bb", ring: "#8a6420" },
  purple: { base: "#5b3690", light: "#8460bd", dark: "#2c1848", inset: "#ecd9b4", ring: "#d9a441" },
} as const;
export type ChipTone = keyof typeof CHIPS;

/** docs/rules/scoring.md §6 */
export const VALUES: Record<string, number> = {
  A: 1, E: 1, I: 1, O: 1, U: 1, R: 2, S: 2, T: 2, L: 2, N: 2, D: 3, G: 3,
  B: 4, C: 4, M: 4, P: 4, F: 5, H: 5, V: 5, W: 5, Y: 5, K: 5, J: 8, X: 8, Q: 10, Z: 10,
};

export const F = {
  ui: loadFredoka("normal", { weights: ["600", "700"], subsets: ["latin"] }).fontFamily,
  body: loadInter("normal", { weights: ["500", "700"], subsets: ["latin"] }).fontFamily,
  tile: loadLilita("normal", { weights: ["400"], subsets: ["latin"] }).fontFamily,
};

export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
