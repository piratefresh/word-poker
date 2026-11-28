import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { powerCount, type SlotPower, type SlotSpellerState } from "@wordpoker/game-rules";

import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import { FRAME_ACROSS, type Box } from "./slot-grid";
import { CANDY, Orb } from "./slot-round-sheet";
import { heldPowers } from "./slot-run-menu";

/**
 * The G1 cabinet's live layer. In portrait it sits on the painted art (`glossy-reels.jpg`) and every
 * box is the artboard's own, in artboard px (390 × 844), times `unit`. In landscape (past eight
 * reels) there is no art for it, so each piece draws its own chrome in a column left of the reels.
 */
export const ARTBOARD = { width: 390, height: 844 } as const;

/** Where every live piece of the cabinet sits on the stage, in device px. */
export interface CabinetLayout {
  /** Artboard px to device px: the scale every piece's lettering and chrome is drawn at. */
  unit: number;
  /** The art paints the chrome (portrait); otherwise each piece draws its own. */
  painted: boolean;
  back: Box;
  menu: Box;
  title: Box;
  meter: Box;
  target: Box;
  spins: Box;
  window: Box;
  hint: Box;
  cellKey: Box;
  moves: Box;
  pay: Box;
  tokens: Box;
  sockets: readonly Box[];
  caption: Box;
  /** The drawn control column behind the pieces, in landscape. */
  panel: Box | null;
}

const scaled = (box: Box, unit: number, dx = 0, dy = 0): Box => ({
  left: dx + box.left * unit,
  top: dy + box.top * unit,
  width: box.width * unit,
  height: box.height * unit,
});

/** The power shelf's four sockets on the artboard: their centres, their top, their size. */
const SOCKET_CENTRES = [90.4, 160, 229.5, 299.6];
const SOCKET = 46;

/** The painted G1 artboard's boxes. The window box covers the painted 5 × 3 window, corners and all. */
const PORTRAIT = {
  back: { left: 9, top: 71, width: 53, height: 54 },
  menu: { left: 328, top: 71, width: 53, height: 54 },
  title: { left: 102, top: 71, width: 188, height: 30 },
  meter: { left: 130, top: 116, width: 142, height: 19 },
  target: { left: 56, top: 193, width: 127, height: 36 },
  spins: { left: 206, top: 193, width: 128, height: 36 },
  window: { left: 6, top: 241, width: 378, height: 346 },
  hint: { left: 0, top: 586, width: 390, height: 18 },
  cellKey: { left: 0, top: 603, width: 390, height: 14 },
  pay: { left: 125, top: 626, width: 144, height: 47 },
  moves: { left: 37, top: 653, width: 67, height: 25 },
  tokens: { left: 286, top: 653, width: 67, height: 25 },
  sockets: SOCKET_CENTRES.map((centre) => ({ left: centre - SOCKET / 2, top: 701, width: SOCKET, height: SOCKET })),
  caption: { left: 0, top: 768, width: 390, height: 18 },
} as const;

/** The painted cabinet, scaled by `unit`, in the stage's own px. */
export function portraitLayout(unit: number): CabinetLayout {
  const place = (box: Box): Box => scaled(box, unit);
  return {
    unit,
    painted: true,
    back: place(PORTRAIT.back),
    menu: place(PORTRAIT.menu),
    title: place(PORTRAIT.title),
    meter: place(PORTRAIT.meter),
    target: place(PORTRAIT.target),
    spins: place(PORTRAIT.spins),
    window: place(PORTRAIT.window),
    hint: place(PORTRAIT.hint),
    cellKey: place(PORTRAIT.cellKey),
    moves: place(PORTRAIT.moves),
    pay: place(PORTRAIT.pay),
    tokens: place(PORTRAIT.tokens),
    sockets: PORTRAIT.sockets.map(place),
    caption: place(PORTRAIT.caption),
    panel: null,
  };
}

/**
 * The landscape control column, in its own px at unit 1 (220 wide): header, meter, the two plaques,
 * the deck, the shelf, then the hint and the cell key at the foot.
 */
const COLUMN = {
  width: 220,
  height: 334,
  back: { left: 8, top: 8, width: 40, height: 40 },
  menu: { left: 172, top: 8, width: 40, height: 40 },
  title: { left: 50, top: 12, width: 120, height: 30 },
  meter: { left: 14, top: 54, width: 192, height: 18 },
  target: { left: 10, top: 80, width: 96, height: 54 },
  spins: { left: 114, top: 80, width: 96, height: 54 },
  moves: { left: 8, top: 152, width: 54, height: 28 },
  pay: { left: 66, top: 144, width: 88, height: 44 },
  tokens: { left: 158, top: 152, width: 54, height: 28 },
  sockets: [32.5, 84.2, 135.8, 187.5].map((centre) => ({ left: centre - 21, top: 198, width: 42, height: 42 })),
  caption: { left: 0, top: 244, width: 220, height: 16 },
  hint: { left: 8, top: 270, width: 204, height: 36 },
  cellKey: { left: 8, top: 310, width: 204, height: 14 },
} as const;
/** Between the column and the reel window, and around the screen's edges. */
const GUTTER = 12;

/** The smallest the landscape column shrinks to, to give the reels their width. */
const MIN_COLUMN_UNIT = 0.72;

/**
 * The landscape screen: the control column on the left, the reel window filling the rest. The
 * column shrinks (down to `MIN_COLUMN_UNIT`) until every reel's nudge arrow gets a 44pt column.
 */
export function landscapeLayout(
  width: number,
  height: number,
  insets: { top: number; right: number; bottom: number; left: number },
  reels: number,
): CabinetLayout {
  const left = Math.max(insets.left, GUTTER);
  const right = Math.max(insets.right, GUTTER);
  const top = Math.max(insets.top, GUTTER);
  const bottom = Math.max(insets.bottom, GUTTER / 2);
  const tall = height - top - bottom;
  const roomForReels = (width - left - right - GUTTER - reels * MIN_TARGET) / (COLUMN.width + FRAME_ACROSS);
  const unit = Math.min(tall / COLUMN.height, (width * 0.3) / COLUMN.width, 1.15, Math.max(roomForReels, MIN_COLUMN_UNIT));
  const columnWidth = COLUMN.width * unit;
  const dy = top + (tall - COLUMN.height * unit) / 2;
  const place = (box: Box): Box => scaled(box, unit, left, dy);
  const windowLeft = left + columnWidth + GUTTER;
  return {
    unit,
    painted: false,
    back: place(COLUMN.back),
    menu: place(COLUMN.menu),
    title: place(COLUMN.title),
    meter: place(COLUMN.meter),
    target: place(COLUMN.target),
    spins: place(COLUMN.spins),
    window: { left: windowLeft, top, width: width - right - windowLeft, height: tall },
    hint: place(COLUMN.hint),
    cellKey: place(COLUMN.cellKey),
    moves: place(COLUMN.moves),
    pay: place(COLUMN.pay),
    tokens: place(COLUMN.tokens),
    sockets: COLUMN.sockets.map(place),
    caption: place(COLUMN.caption),
    panel: { left, top: dy, width: columnWidth, height: COLUMN.height * unit },
  };
}

const INK = "#fffaf0";
const BROWN = "#8a4b12";
const GOLD = "#eaa93b";
const GOLD_NUMERAL = "#ffd25a";
/** Every control is at least this big to the finger. */
const MIN_TARGET = 44;

const at = (box: Box) => ({ position: "absolute" as const, ...box });

/** A box grown about its centre to at least the finger's 44pt. */
function hitBox(box: Box): Box {
  const width = Math.max(box.width, MIN_TARGET);
  const height = Math.max(box.height, MIN_TARGET);
  return { left: box.left - (width - box.width) / 2, top: box.top - (height - box.height) / 2, width, height };
}

/** The drawn control column behind the landscape pieces: G1's deck panel, gold rim on green. */
export function SlotPanel({ layout }: { layout: CabinetLayout }): ReactElement | null {
  if (layout.panel === null) return null;
  return (
    <LinearGradient
      colors={["#3b8f39", "#2b752c", "#215f24"]}
      pointerEvents="none"
      style={[at(layout.panel), styles.panel, { borderRadius: 18 * layout.unit, borderWidth: 4 * layout.unit }]}
    />
  );
}

interface HeaderButtonProps {
  box: Box;
  layout: CabinetLayout;
  icon: "arrow-back" | "menu";
  label: string;
  onPress: () => void;
  testID: string;
}

/** A round header button: a hit target over the painted one, or a drawn gold button. */
function HeaderButton({ box, layout, icon, label, onPress, testID }: HeaderButtonProps): ReactElement {
  const target = layout.painted ? box : hitBox(box);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      id={webTestID(testID)}
      onPress={onPress}
      style={({ pressed }) => [at(target), styles.round, styles.centred, pressed && styles.pressed]}
      testID={testID}
    >
      {layout.painted ? null : (
        <LinearGradient
          colors={["#ffd76a", "#f2a531", "#d9821c"]}
          style={[styles.centred, { width: box.width, height: box.height, borderRadius: box.width / 2, borderWidth: 2 * layout.unit, borderColor: BROWN }]}
        >
          <Ionicons color={INK} name={icon} size={box.width * 0.55} />
        </LinearGradient>
      )}
    </Pressable>
  );
}

export interface SlotHeaderProps {
  layout: CabinetLayout;
  state: SlotSpellerState;
  /** The round score the meter shows: behind the engine's while a pay sequence fills it word by word. */
  score: number;
  /** The live grid's total while moving: the meter's lighter fill and its `+n`. */
  preview: number;
  /** After a pay, the meter opens that spin's payout; `undefined` before one. */
  onPayout?: () => void;
  onBack: () => void;
  onMenu: () => void;
}

/** A pay's points land in the meter this long after their word's beat starts: the flight's length, near enough. */
const FILL_DELAY_MS = 300;
const FILL_MS = 260;

/** Back, the round's title on the painted ribbon, the progress meter, and the Run menu. */
export function SlotHeader({ layout, state, score: roundScore, preview, onPayout, onBack, onMenu }: SlotHeaderProps): ReactElement {
  const { unit } = layout;
  const { round, target } = state;
  const scoreFill = Math.min(roundScore / target, 1);
  const previewFill = Math.min((roundScore + preview) / target, 1);
  const meterWidth = layout.meter.width;
  const reduceMotion = useReducedMotion();

  // The fill grows as a pay's points land in it, and drops at once when a new round starts.
  const fill = useSharedValue(scoreFill);
  useEffect(() => {
    fill.value =
      reduceMotion || scoreFill < fill.value
        ? scoreFill
        : withDelay(FILL_DELAY_MS, withTiming(scoreFill, { duration: FILL_MS, easing: Easing.out(Easing.cubic) }));
  }, [scoreFill, reduceMotion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: meterWidth * fill.value }));

  const label = `${roundScore} of ${target} points`;
  return (
    <>
      <HeaderButton box={layout.back} layout={layout} icon="arrow-back" label="Back" onPress={onBack} testID="slot-back" />
      <HeaderButton box={layout.menu} layout={layout} icon="menu" label="Run menu" onPress={onMenu} testID="slot-menu" />
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1}
        style={[at(layout.title), styles.title, outlined(22 * unit, layout.title.height, BROWN)]}
      >
        {`Round ${round}`}
      </Text>
      <Pressable
        accessibilityHint={onPayout === undefined ? undefined : "Shows the last spin's payout, word by word"}
        accessibilityLabel={label}
        accessibilityRole={onPayout === undefined ? "progressbar" : "button"}
        accessibilityValue={{ min: 0, max: target, now: Math.min(roundScore, target) }}
        disabled={onPayout === undefined}
        hitSlop={{ top: 12, bottom: 12 }}
        id={webTestID("slot-meter")}
        onPress={onPayout}
        style={[at(layout.meter), styles.meter, { borderRadius: 10 * unit }, !layout.painted && [styles.meterTrack, { borderWidth: 2 * unit }]]}
        testID="slot-meter"
      >
        {previewFill > scoreFill ? (
          <View style={[styles.fill, styles.previewFill, { width: meterWidth * previewFill, borderRadius: 9 * unit }]} />
        ) : null}
        <Animated.View style={[styles.fill, { borderRadius: 9 * unit, overflow: "hidden" }, fillStyle]}>
          <LinearGradient
            colors={["#8be36a", "#3fae3a", "#2d8a2c"]}
            locations={[0, 0.55, 1]}
            style={[StyleSheet.absoluteFill, { width: meterWidth }]}
          />
        </Animated.View>
        <Text maxFontSizeMultiplier={1} style={[styles.meterText, { fontSize: 13 * unit, lineHeight: layout.meter.height - (layout.painted ? 0 : 4 * unit) }]} testID="slot-score">
          {`${roundScore}`}
          {preview > 0 ? <Text style={styles.meterPlus}>{` +${preview}`}</Text> : null}
          {` / ${target}`}
        </Text>
        {/* After a pay the meter opens the payout: a small chevron says it can. */}
        {onPayout !== undefined ? (
          <Ionicons color="#ffffff" name="chevron-forward" size={12 * unit} style={[styles.meterMore, { right: 5 * unit }]} />
        ) : null}
      </Pressable>
    </>
  );
}

/** A counter plaque: gold numerals on the painted plaque, or on a drawn one under its label. */
function Plaque({ box, layout, label, value, accessibilityLabel, testID }: { box: Box; layout: CabinetLayout; label: string; value: number; accessibilityLabel: string; testID: string }): ReactElement {
  const { unit, painted } = layout;
  const numeral = [styles.numeral, { fontSize: 30 * unit, lineHeight: 36 * unit }];
  if (painted) {
    return (
      <Text accessibilityLabel={accessibilityLabel} maxFontSizeMultiplier={1} style={[at(box), numeral]} testID={testID}>
        {value}
      </Text>
    );
  }
  return (
    <View accessibilityLabel={accessibilityLabel} accessible style={[at(box), styles.plaque, { borderRadius: 10 * unit, borderWidth: 2.5 * unit }]}>
      <Text maxFontSizeMultiplier={1} style={[styles.plaqueLabel, { fontSize: 12 * unit, lineHeight: 15 * unit }]}>
        {label}
      </Text>
      <Text maxFontSizeMultiplier={1} style={numeral} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

/** The two counter plaques: the target and the spins left, in gold numerals. */
export function SlotPlaques({ layout, state }: { layout: CabinetLayout; state: SlotSpellerState }): ReactElement {
  return (
    <>
      <Plaque box={layout.target} layout={layout} label="TARGET" value={state.target} accessibilityLabel={`Target ${state.target}`} testID="slot-target" />
      <Plaque
        box={layout.spins}
        layout={layout}
        label="SPINS"
        value={state.spinsLeft}
        accessibilityLabel={`${state.spinsLeft} ${state.spinsLeft === 1 ? "spin" : "spins"} left`}
        testID="slot-spins"
      />
    </>
  );
}

/** The line under the reels that says what to do next. */
export function SlotHint({ layout, children }: { layout: CabinetLayout; children: string }): ReactElement {
  const { unit } = layout;
  return (
    <Text
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={1.2}
      style={[styles.hint, { left: layout.hint.left, top: layout.hint.top, width: layout.hint.width, fontSize: 14 * unit, lineHeight: 18 * unit }]}
      testID="slot-hint"
    >
      {children}
    </Text>
  );
}

export interface SlotDeckProps {
  layout: CabinetLayout;
  /** Moves left, or null outside a spin. */
  moves: number | null;
  tokens: number;
  /** The green button's word: `PAY +n`, `SPIN`, `SHOP`… */
  label: string;
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}

/** The control deck: moves with the blue gem, the green button, tokens with the coin. */
export function SlotDeck({ layout, moves, tokens, label, accessibilityLabel, disabled, onPress, testID }: SlotDeckProps): ReactElement {
  const { unit, painted } = layout;
  const well = painted ? null : [styles.well, { borderRadius: 8 * unit }];
  const row = [styles.counterRow, { gap: 5 * unit }, well];
  const counter = [styles.counter, { fontSize: 18 * unit, lineHeight: 25 * unit }];
  const payFont = Math.min(26 * unit, (layout.pay.width / Math.max(label.length, 4)) * 1.6);
  return (
    <>
      <View accessibilityLabel={moves === null ? "No moves until the next spin" : `${moves} ${moves === 1 ? "move" : "moves"} left`} accessible style={[at(layout.moves), row]}>
        <Gem size={15 * unit} />
        <Text maxFontSizeMultiplier={1} style={counter}>{moves === null ? "–" : moves}</Text>
      </View>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        id={webTestID(testID)}
        onPress={onPress}
        style={({ pressed }) => [at(layout.pay), styles.pay, { borderRadius: 14 * unit }, disabled && styles.payDisabled, pressed && styles.pressed]}
        testID={testID}
      >
        {painted ? null : (
          <LinearGradient
            colors={["#8ff06a", "#45c23a", "#2c9a2a"]}
            style={[StyleSheet.absoluteFill, { borderRadius: 14 * unit, borderWidth: 3 * unit, borderColor: "#e6f6ff" }]}
          />
        )}
        <Text maxFontSizeMultiplier={1} style={[styles.payLabel, outlined(payFont, layout.pay.height, "#1f6b1c")]}>
          {label}
        </Text>
      </Pressable>
      <View accessibilityLabel={`${tokens} tokens`} accessible style={[at(layout.tokens), row]}>
        <Text maxFontSizeMultiplier={1} style={counter} testID="slot-tokens">
          {tokens}
        </Text>
        <Coin size={17 * unit} />
      </View>
    </>
  );
}

/**
 * The power shelf's four sockets: a held power's orb in its type's candy, or the lock on an empty
 * socket. Past four powers the fourth socket shows `+n` for the rest. Tapping a held socket opens it.
 */
export function SlotPowerShelf({
  layout,
  state,
  onOpen,
}: {
  layout: CabinetLayout;
  state: SlotSpellerState;
  onOpen: (powers: readonly SlotPower[]) => void;
}): ReactElement {
  const { unit, painted } = layout;
  const held = heldPowers(state);
  const sockets = layout.sockets.length;
  const overflow = held.length > sockets ? held.slice(sockets - 1) : [];
  return (
    <>
      {layout.sockets.map((socket, index) => {
        const more = overflow.length > 0 && index === sockets - 1;
        const power = held[index];
        const opens = more ? overflow : power === undefined ? null : [power];
        const size = socket.width * 0.9;
        return (
          <Pressable
            key={index}
            accessibilityLabel={
              more
                ? `${overflow.length} more powers`
                : power === undefined
                  ? `Empty power slot ${index + 1}`
                  : `${power.name} power${powerCount(state.powers, power.id) > 1 ? ` ×${powerCount(state.powers, power.id)}` : ""}`
            }
            accessibilityRole="button"
            accessibilityState={{ disabled: opens === null }}
            disabled={opens === null}
            id={webTestID(`slot-socket-${index}`)}
            onPress={opens === null ? undefined : () => onOpen(opens)}
            style={({ pressed }) => [at(hitBox(socket)), styles.socket, pressed && styles.pressed]}
            testID={`slot-socket-${index}`}
          >
            <View style={[styles.centred, { width: socket.width, height: socket.height, borderRadius: socket.width / 2 }, !painted && [styles.socketWell, { borderWidth: 3 * unit }]]}>
              {more ? (
                <Orb candy={CANDY.upgrade} glyph={`+${overflow.length}`} size={size} />
              ) : power === undefined ? (
                <Padlock size={socket.width * 0.6} />
              ) : (
                <Orb candy={CANDY[power.type]} glyph={power.glyph} size={size} />
              )}
            </View>
          </Pressable>
        );
      })}
      <Text
        maxFontSizeMultiplier={1.2}
        style={[styles.caption, { left: layout.caption.left, top: layout.caption.top, width: layout.caption.width, fontSize: 14 * unit, lineHeight: 18 * unit }]}
      >
        {held.length === 0 ? "Powers · none yet" : `Powers · ${held.length} held · tap one`}
      </Text>
    </>
  );
}

/** The cabinet's lettering outline: a hard drop in the stroke's colour, as near as one text shadow gets. */
function outlined(fontSize: number, lineHeight: number, stroke: string): TextStyle {
  return { fontSize, lineHeight, textShadowColor: stroke, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1 };
}

function Icon({ size, viewBox, children }: { size: number; viewBox: string; children: ReactNode }): ReactElement {
  return (
    <Svg aria-hidden height={size} viewBox={viewBox} width={size}>
      {children}
    </Svg>
  );
}

function Gem({ size }: { size: number }): ReactElement {
  return (
    <Icon size={size} viewBox="0 0 16 16">
      <Path d="M8 1 L15 8 L8 15 L1 8 Z" fill="#5fb0ff" stroke="#1d5fa8" strokeLinejoin="round" strokeWidth={1.4} />
      <Path d="M8 3.5 L12.5 8 L8 8 Z" fill="#d8eeff" />
    </Icon>
  );
}

function Coin({ size }: { size: number }): ReactElement {
  return (
    <Icon size={size} viewBox="0 0 16 16">
      <Circle cx={8} cy={8} fill="#f6c444" r={7} stroke="#9a6a12" strokeWidth={1.5} />
      <Path d="M8 4.2 L9.1 6.6 L11.7 6.9 L9.8 8.6 L10.3 11.2 L8 9.9 L5.7 11.2 L6.2 8.6 L4.3 6.9 L6.9 6.6 Z" fill="#fff1b8" />
    </Icon>
  );
}

function Padlock({ size }: { size: number }): ReactElement {
  return (
    <Icon size={size} viewBox="0 0 28 30">
      <Path d="M8 13 V9 a6 6 0 0 1 12 0 V13" fill="none" stroke="#b9831f" strokeLinecap="round" strokeWidth={3.2} />
      <Rect fill="#f2b93b" height={16} rx={4} stroke="#8a5410" strokeWidth={1.5} width={20} x={4} y={12} />
      <Circle cx={14} cy={19} fill="#6b3f0c" r={2.4} />
      <Rect fill="#6b3f0c" height={4.5} rx={1} width={2} x={13} y={20} />
    </Icon>
  );
}

const styles = StyleSheet.create({
  round: { borderRadius: 999 },
  centred: { alignItems: "center", justifyContent: "center" },
  panel: { position: "absolute", borderColor: GOLD },
  meterTrack: { backgroundColor: "#173a2a", borderColor: GOLD },
  plaque: { alignItems: "center", justifyContent: "center", backgroundColor: "#1c3b3a", borderColor: GOLD },
  plaqueLabel: { fontFamily: fonts.ui, color: INK, letterSpacing: 0.5 },
  well: { backgroundColor: "rgba(90,48,14,0.75)" },
  socketWell: { backgroundColor: "#6b3f15", borderColor: GOLD },
  pressed: { opacity: 0.7 },
  title: { margin: 0, textAlign: "center", fontFamily: fonts.ui, color: INK },
  meter: { overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 1, bottom: 1 },
  previewFill: { backgroundColor: "rgba(139,227,106,0.45)" },
  meterMore: { position: "absolute", top: "50%", marginTop: -6, opacity: 0.85 },
  meterText: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    textAlign: "center",
    fontFamily: fonts.uiMedium,
    color: INK,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  meterPlus: { color: "#c9ff9e" },
  numeral: {
    textAlign: "center",
    fontFamily: fonts.ui,
    color: GOLD_NUMERAL,
    textShadowColor: "#6b4210",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  hint: {
    position: "absolute",
    left: 0,
    textAlign: "center",
    fontFamily: fonts.uiMedium,
    color: "#fff3d6",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  counterRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  counter: {
    fontFamily: fonts.ui,
    color: INK,
    textShadowColor: "rgba(0,0,0,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  pay: { alignItems: "center", justifyContent: "center" },
  payDisabled: { opacity: 0.55 },
  payLabel: { fontFamily: fonts.ui, color: "#ffffff", textAlign: "center" },
  socket: { position: "absolute", alignItems: "center", justifyContent: "center", borderRadius: 999 },
  caption: {
    position: "absolute",
    left: 0,
    textAlign: "center",
    fontFamily: fonts.uiMedium,
    letterSpacing: 0.5,
    color: "#f2ffe0",
    textShadowColor: "rgba(20,60,10,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
