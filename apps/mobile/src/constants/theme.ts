/**
 * theme.ts — design tokens for the Word Poker / Four-in-a-Row app (Expo / React Native).
 * Derived from the existing casino-felt prototypes: deep felt greens, gold, parchment cream.
 *
 * import { theme } from './theme';
 * or cherry-pick: import { colors, spacing, radius, type } from './theme';
 */

import { Platform, TextStyle, ViewStyle } from "react-native";
import { LOBBY_PLAYER_COLORS } from "@wordpoker/contracts";

/* ── palette (raw ramps) ─────────────────────────────────────────── */

export const palette = {
  felt900: "#020a07",
  felt800: "#051410",
  felt700: "#060d06",
  felt600: "#0a1d17",
  felt500: "#0d3b2e",
  felt400: "#1a4a35",
  felt300: "#2f5418",

  gold600: "#7e5e16",
  gold500: "#9c7620",
  gold400: "#c79a2e",
  gold300: "#d4a54a",
  gold200: "#e7c75a",
  gold100: "#f7df7a",
  gold050: "#fbe6a6",

  cream100: "#f4e4c1",
  cream200: "#e8dcc0",
  cream300: "#d9c392",
  cream400: "#c4b48a",

  red400: "#ff6b6b",
  red500: "#ff5d4e",
  green300: "#7ee7c0",
  green400: "#4caf88",
  green500: "#9ec27a",
  blue400: "#7ec4cf",
  amber400: "#e6b450",
  violet400: "#a78bfa",
  pink400: "#f0a8c0",

  tileInk: "#2b1810",
  onGold: "#1a1208",
} as const;

/* ── poker chips ─────────────────────────────────────────────────── */

/**
 * The painted chip's tones (STO-481): the body lit from the top left (`light` → `base` →
 * `dark`), the cream edge inserts, the inner ring and the emblem. Gold carries a dark emblem,
 * the way the reference sheet does. Purple is the hero chip's, not a denomination.
 */
export const chipTones = {
  red: {
    base: "#b3241f",
    light: "#dc4a3c",
    dark: "#5e1210",
    inset: "#ecd9b4",
    emblem: "#d9a441",
    ring: "#d9a441",
  },
  blue: {
    base: "#1d4f9c",
    light: "#3b7acb",
    dark: "#0b2a57",
    inset: "#ecd9b4",
    emblem: "#d9a441",
    ring: "#d9a441",
  },
  green: {
    base: "#11704a",
    light: "#2c9a68",
    dark: "#06402a",
    inset: "#ecd9b4",
    emblem: "#d9a441",
    ring: "#d9a441",
  },
  black: {
    base: "#2a2824",
    light: "#4f4a41",
    dark: "#11100e",
    inset: "#e6d3ae",
    emblem: "#d9a441",
    ring: "#d9a441",
  },
  gold: {
    base: "#c9983f",
    light: "#efc86e",
    dark: "#7a561c",
    inset: "#f3e2bb",
    emblem: "#3a2a12",
    ring: "#8a6420",
  },
  purple: {
    base: "#5b3690",
    light: "#8460bd",
    dark: "#2c1848",
    inset: "#ecd9b4",
    emblem: "#d9a441",
    ring: "#d9a441",
  },
} as const;

export type ChipTone = keyof typeof chipTones;

/* ── semantic colors ─────────────────────────────────────────────── */

export const colors = {
  // surfaces
  bg: palette.felt500,
  bgElevated: palette.felt600,
  surface: "rgba(0,0,0,0.25)",
  surfaceStrong: "rgba(0,0,0,0.35)",
  felt: palette.felt500,
  feltHi: palette.felt400,
  scrim: "rgba(2,10,7,0.7)",

  // ink
  text: palette.cream200,
  textBright: palette.cream100,
  textDim: "rgba(232,220,192,0.6)",
  textFaint: "rgba(232,220,192,0.3)",
  onGold: palette.onGold,
  onTile: palette.tileInk,

  // brand
  gold: palette.gold300,
  goldHi: palette.gold100,
  goldDeep: palette.gold600,

  // borders
  border: "rgba(212,175,55,0.18)",
  borderFaint: "rgba(212,175,55,0.08)",
  borderStrong: "rgba(212,175,55,0.45)",

  // status / accents
  success: palette.green400,
  successHi: palette.green300,
  danger: palette.red400,
  warning: palette.amber400,
  info: palette.blue400,
  chipUp: palette.green400,
  chipDown: palette.red400,
  chipUpOnTile: "#28683f",
  chipDownOnTile: "#a22e25",

  // player accent wheel (assign by index for avatars, seats, rows)
  players: LOBBY_PLAYER_COLORS,
} as const;

/** The Hand Ledger (History) book: ink on parchment cards and on the felt pages. */
export const ledger = {
  ink: "#3a2210",
  inkBody: "#5a3a1c",
  inkSoft: "#7a5634",
  inkMuted: "#a58a68",
  onFelt: "#f3e6c4",
  onFeltDim: "#b9c2b4",
  parchment: "#f7e7b5",
  goldText: "#f7d77a",
  goldEdge: "#e0974a",
  goldButton: ["#ffd877", "#e6a73e"] as const,
  goldButtonEdge: "#9a5f1c",
  modeTile: "#1f4a33",
  modeTileEdge: "#0e2a1c",
  synced: "#3fae6a",
  syncing: "#e6a73e",
  offline: "#8a8a80",
  rejectedLink: "#a3271e",
  rejectedBg: "#f3d0c6",
  rejectedInk: "#6e1d16",
} as const;

/** STO-688 design 2a. Scoped so the night lobby doesn't recolour existing screens. */
export const nightLobby = {
  text: { cream: ledger.onFelt, muted: "#aab3d6", label: "#9aa6cf" },
  gold: {
    light: ledger.goldText,
    ring: ledger.goldEdge,
    button: ledger.goldButton,
    buttonEdge: ledger.goldButtonEdge,
    buttonText: ledger.ink,
  },
  panel: {
    navy: ["#141f45", "#0a1028"],
    headliner: ["#1b2650", "#0f1734"],
    row: "rgba(14,22,48,0.88)",
  },
  border: { subtle: "rgba(243,230,196,0.12)" },
  status: { open: "#8fd19e", live: "#ff5a4a", full: "#7d86a8" },
  sky: ["#02030a", "#050a1c", "#0a1532", "#0d1a3c"],
  coin: { gradient: ["#ffe28a", "#c98a2c"], text: ledger.parchment },
} as const;

/* ── gradients (expo-linear-gradient: {...gradients.felt}) ───────── */

export const gradients = {
  felt: {
    colors: [palette.felt600, palette.felt800] as const,
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  },
  goldButton: {
    colors: [palette.gold200, palette.gold300, palette.gold500] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  // Smooth ivory, lit from the upper left (STO-538); sampled off the tabletop reference.
  tile: {
    colors: ["#fff6e2", "#f0dbb2"] as const,
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  tileDim: {
    colors: [palette.cream400, "#a8987a", "#8a7a5e"] as const,
    start: { x: 0.15, y: 0 },
    end: { x: 0.85, y: 1 },
  },
  table: {
    colors: [palette.felt300, "#1d3711", "#0e1d09"] as const,
    start: { x: 0.5, y: 0 },
    end: { x: 0.5, y: 1 },
  },
} as const;

/**
 * The letter tile's material (STO-538): an ivory face (`gradients.tile`) on a tan slab, printed in
 * near-black; its back is a crimson inlay with a lighter inset line and diamond. All of it is
 * views — no image, no canvas — so a row of seven costs seven views, not seven GL contexts.
 */
export const tileMaterial = {
  slab: "#c4743a",
  /** The dark rim round the slab's foot and the face's edge on a tile with no owner colour. */
  edge: "#6b3a12",
  ink: "#2b1c10",
  /** A seat's own two letters: a dark face, ringed in gold, on a black slab. */
  private: {
    gradient: ["#4a4540", "#1c1917"] as const,
    ring: "#f2c75a",
    slab: "#000000",
    ink: "#fff6e2",
  },
  /** The 2x / 3x pill on a tile's corner, printed in `ink`. */
  multiplier: { double: "#f2c75a", triple: "#ff8a5c", ink: "#2a1906" },
  back: {
    gradient: ["#b81f29", "#8b161e"] as const,
    slab: "#5a0b10",
    edge: "#2e0407",
    inset: "#e0545a",
    diamond: "#d0383f",
  },
} as const;

/* ── spacing — 4pt base ──────────────────────────────────────────── */

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
  gutter: 20, // standard screen side padding
} as const;

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  tile: 4,
  card: 12,
  sheet: 24,
  pill: 999,
} as const;

export const border = {
  hairline: 1,
  thin: 1.5,
  thick: 2,
} as const;

/* ── typography ──────────────────────────────────────────────────── */

/** CSS font-family fallback stack for monospace (web). */
export const monoFamily =
  "JetBrains Mono,ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace";

/** Load with @expo-google-fonts/{inter,noto-serif,jetbrains-mono,lilita-one,fredoka,roboto-slab}. */
export const fonts = {
  sans: Platform.select({
    ios: "Inter_400Regular",
    android: "Inter_400Regular",
    default: "system-ui",
  })!,
  sansMedium: "Inter_500Medium",
  sansBold: "Inter_700Bold",
  sansBlack: "Inter_800ExtraBold",
  serif: "NotoSerif_400Regular",
  serifBold: "NotoSerif_700Bold",
  serifBoldItalic: "NotoSerif_700Bold_Italic",
  mono: Platform.select({
    ios: "JetBrainsMono_400Regular",
    android: "JetBrainsMono_400Regular",
    default: monoFamily,
  })!,
  monoBold: "JetBrainsMono_600SemiBold",
  /** The chunky arcade face of the HUD's clock digits. */
  arcade: "LilitaOne_400Regular",
  /** The game UI's chunky rounded face: buttons, values, labels. */
  ui: "Fredoka_700Bold",
  uiMedium: "Fredoka_600SemiBold",
  /** Wooden-sign slab for panel headings. */
  slab: "RobotoSlab_800ExtraBold",
  /** Body face of the menus and the Hand Ledger; bundled in app/_layout.tsx. */
  rubik: "Rubik_400Regular",
  rubikMedium: "Rubik_500Medium",
  rubikSemiBold: "Rubik_600SemiBold",
} as const;

export const fontSize = {
  micro: 9,
  caption: 11,
  small: 13,
  body: 15,
  bodyLg: 17,
  title: 20,
  h3: 24,
  h2: 30,
  h1: 38,
  display: 52,
} as const;

/** Ready-to-spread text styles. */
export const type = {
  /** Small caps monospace stamp — labels, kickers, timestamps. */
  kicker: {
    fontFamily: fonts.mono,
    fontSize: fontSize.micro,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    color: colors.gold,
  } as TextStyle,
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSize.caption,
    letterSpacing: 1.4,
    color: colors.textDim,
  } as TextStyle,
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    lineHeight: 22,
    color: colors.text,
  } as TextStyle,
  bodyDim: {
    fontFamily: fonts.sans,
    fontSize: fontSize.small,
    lineHeight: 19,
    color: colors.textDim,
  } as TextStyle,
  button: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    letterSpacing: 0.5,
  } as TextStyle,
  title: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.title,
    color: colors.textBright,
  } as TextStyle,
  /** Editorial serif headline — screen titles, showdown results. */
  headline: {
    fontFamily: fonts.serifBold,
    fontSize: fontSize.h2,
    lineHeight: 34,
    color: colors.textBright,
  } as TextStyle,
  display: {
    fontFamily: fonts.serifBold,
    fontSize: fontSize.display,
    lineHeight: 56,
    color: colors.gold,
  } as TextStyle,
  /** Tabular figures for chip counts and pots. */
  numeric: {
    fontFamily: fonts.monoBold,
    fontSize: fontSize.bodyLg,
    letterSpacing: 0.5,
    color: colors.goldHi,
  } as TextStyle,
} as const;

/* ── elevation ───────────────────────────────────────────────────── */

const shadow = (
  y: number,
  blur: number,
  opacity: number,
  elevation: number,
): ViewStyle => ({
  shadowColor: "#000",
  shadowOffset: { width: 0, height: y },
  shadowRadius: blur,
  shadowOpacity: opacity,
  elevation,
});

export const elevation = {
  none: shadow(0, 0, 0, 0),
  tile: shadow(2, 3, 0.45, 2),
  card: shadow(4, 10, 0.35, 4),
  sheet: shadow(-4, 24, 0.5, 12),
  modal: shadow(8, 32, 0.55, 16),
} as const;

/** Gold glow for winning tiles, CTAs, live dots. */
export const glow = (color: string = colors.gold, radius = 12): ViewStyle => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 0 },
  shadowRadius: radius,
  shadowOpacity: 0.8,
  elevation: 6,
});

/* ── motion ──────────────────────────────────────────────────────── */

export const duration = {
  instant: 90,
  fast: 160,
  base: 240,
  slow: 380,
  flip: 640,
  deal: 450,
  celebrate: 900,

  // The in-hand screen's own timings (WP-412), kept here with every other duration so no
  // component carries a number of its own — `deal` and `flip` are already the tile's.
  phaseIn: 500,
  potPop: 800,
  wordMorph: 550,
  tileStagger: 130,
  holeStagger: 120,
  chipFlight: 1300,
  chipDelay: 150,
  chipStagger: 60,
  payoutFlight: 1500,
  payoutDelay: 500,
  payoutStagger: 120,
  breathe: 1600,
  winnerBurst: 1100,
  timerPulse: 1000,
  statusFade: 200,
  actionFade: 300,
  /**
   * How long a CPU seat holds the table before its move lands (STO-378). One seat's action per
   * beat: the bots answer on the felt's own clock rather than inside the seat's transition, so
   * the chips a bot sends are on their way before the next seat moves.
   */
  cpuBeat: 900,
} as const;

export const easing = {
  standard: [0.2, 0, 0, 1] as const,
  decelerate: [0, 0, 0.2, 1] as const,
  accelerate: [0.4, 0, 1, 1] as const,
  flip: [0.45, 0, 0.2, 1] as const,
  deal: [0.34, 1.56, 0.64, 1] as const,
  /** Chip flights: Material's standard curve, in and out. */
  inOut: [0.4, 0, 0.2, 1] as const,
  spring: { damping: 16, stiffness: 180, mass: 0.9 },
  springSnappy: { damping: 22, stiffness: 320, mass: 0.7 },
  /** Lands slightly past the mark, then settles — the phase header's rise. */
  springOvershoot: { damping: 11, stiffness: 170, mass: 0.9 },
} as const;

/**
 * The results screen's entrance (STO-384): one clock over the whole sequence, one offset per
 * beat. Every offset is measured from the start of the sequence rather than from the beat
 * before it — the screen's seven beats overlap, and only one clock drives them all.
 */
export const resultsEntrance = {
  /** Where the clock stops: the last beat's end, and the moment the primary goes live. */
  total: 1_140,
  /** The pot's count-up and the CTA row's fade — the two slow beats. */
  count: 700,
  ctaIn: 220,
  /** Beat starts, in ms from the sequence's start. */
  headline: 0,
  pot: 180,
  winner: 420,
  cards: 520,
  cardStagger: 70,
  tiles: 640,
  tileStagger: 40,
  cta: 900,
  /** Beat lengths: the fade-and-rise every entering element shares, and the winner's ring. */
  rise: 320,
  tileIn: 300,
  pulse: 360,
  /** Reduce Motion collapses the whole sequence to this one fade. */
  fade: 200,
} as const;

/* ── layout ──────────────────────────────────────────────────────── */

export const layout = {
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  minTouch: 44,
  headerHeight: 56,
  tabBarHeight: 60,
  maxContentWidth: 520,
  tileSize: { sm: 24, md: 32, lg: 44, rack: 48 },
  boardGap: 4,
  /**
   * A window whose shorter side reaches this is a tablet or a desktop: the shorter side, not the
   * width, so a phone turned on its side keeps the phone sizes instead of spending its little
   * height on larger chrome.
   */
  wideShortSide: 600,
} as const;

export const opacity = { disabled: 0.4, pressed: 0.75, muted: 0.6 } as const;

/* ── the theme object ────────────────────────────────────────────── */

export const theme = {
  palette,
  colors,
  gradients,
  spacing,
  radius,
  border,
  fonts,
  fontSize,
  type,
  elevation,
  glow,
  duration,
  easing,
  resultsEntrance,
  layout,
  opacity,
} as const;

export type Theme = typeof theme;
export type ThemeColor = keyof typeof colors;
export type Spacing = keyof typeof spacing;

export default theme;
