import { LinearGradient } from "expo-linear-gradient";
import type { ReactElement, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type TextStyle } from "react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { SLOT_POWERS, powerCount, type SlotSpellerState } from "@wordpoker/game-rules";

import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

/**
 * The G1 cabinet's live layer, drawn over its painted art (`glossy-reels.jpg`). Every box is the
 * artboard's own, in artboard px (390 × 844), multiplied by `unit` to reach the device.
 */
export const ARTBOARD = { width: 390, height: 844 } as const;
const BACK = { left: 9, top: 71, width: 53, height: 54 };
const MENU = { left: 328, top: 71, width: 53, height: 54 };
const TITLE = { left: 102, top: 71, width: 188, height: 30 };
const METER = { left: 130, top: 116, width: 142, height: 19 };
const TARGET = { left: 56, top: 193, width: 127, height: 36 };
const SPINS = { left: 206, top: 193, width: 128, height: 36 };
const HINT_TOP = 586;
const PAY = { left: 125, top: 626, width: 144, height: 47 };
const MOVES = { left: 37, top: 653, width: 67, height: 25 };
const TOKENS = { left: 286, top: 653, width: 67, height: 25 };
/** The power shelf's four sockets: their centres, their top, their size. */
const SOCKETS = [90.4, 160, 229.5, 299.6];
const SOCKET_TOP = 701;
const SOCKET = 46;
const SHELF_CAPTION_TOP = 768;

const INK = "#fffaf0";
const BROWN = "#8a4b12";
const GOLD_NUMERAL = "#ffd25a";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const place = (box: Box, unit: number) => ({
  position: "absolute" as const,
  left: box.left * unit,
  top: box.top * unit,
  width: box.width * unit,
  height: box.height * unit,
});

/** A transparent hit target over one of the painted round header buttons. */
function HeaderButton({ box, unit, label, onPress, testID }: { box: Box; unit: number; label: string; onPress: () => void; testID: string }): ReactElement {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      id={webTestID(testID)}
      onPress={onPress}
      style={({ pressed }) => [place(box, unit), styles.round, pressed && styles.pressed]}
      testID={testID}
    />
  );
}

export interface SlotHeaderProps {
  unit: number;
  state: SlotSpellerState;
  /** The live grid's total while moving: the meter's lighter fill and its `+n`. */
  preview: number;
  onBack: () => void;
  onMenu: () => void;
}

/** Back, the round's title on the painted ribbon, the progress meter, and the Run menu. */
export function SlotHeader({ unit, state, preview, onBack, onMenu }: SlotHeaderProps): ReactElement {
  const { round, roundScore, target } = state;
  const scoreFill = Math.min(roundScore / target, 1);
  const previewFill = Math.min((roundScore + preview) / target, 1);
  const meterWidth = METER.width * unit;
  return (
    <>
      <HeaderButton box={BACK} unit={unit} label="Back" onPress={onBack} testID="slot-back" />
      <HeaderButton box={MENU} unit={unit} label="Run menu" onPress={onMenu} testID="slot-menu" />
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1}
        style={[place(TITLE, unit), styles.title, outlined(22 * unit, 30 * unit, BROWN)]}
      >
        {`Round ${round}`}
      </Text>
      <View
        accessibilityLabel={`${roundScore} of ${target} points`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: target, now: Math.min(roundScore, target) }}
        style={[place(METER, unit), styles.meter, { borderRadius: 10 * unit }]}
        testID="slot-meter"
      >
        {previewFill > scoreFill ? (
          <View style={[styles.fill, styles.previewFill, { width: meterWidth * previewFill, borderRadius: 9 * unit }]} />
        ) : null}
        <LinearGradient
          colors={["#8be36a", "#3fae3a", "#2d8a2c"]}
          locations={[0, 0.55, 1]}
          style={[styles.fill, { width: meterWidth * scoreFill, borderRadius: 9 * unit }]}
        />
        <Text maxFontSizeMultiplier={1} style={[styles.meterText, { fontSize: 13 * unit, lineHeight: 19 * unit }]} testID="slot-score">
          {`${roundScore}`}
          {preview > 0 ? <Text style={styles.meterPlus}>{` +${preview}`}</Text> : null}
          {` / ${target}`}
        </Text>
      </View>
    </>
  );
}

/** The two painted counter plaques: the target and the spins left, in gold numerals. */
export function SlotPlaques({ unit, state }: { unit: number; state: SlotSpellerState }): ReactElement {
  const numeral = [styles.numeral, { fontSize: 30 * unit, lineHeight: 36 * unit }];
  return (
    <>
      <Text accessibilityLabel={`Target ${state.target}`} maxFontSizeMultiplier={1} style={[place(TARGET, unit), numeral]} testID="slot-target">
        {state.target}
      </Text>
      <Text
        accessibilityLabel={`${state.spinsLeft} ${state.spinsLeft === 1 ? "spin" : "spins"} left`}
        maxFontSizeMultiplier={1}
        style={[place(SPINS, unit), numeral]}
        testID="slot-spins"
      >
        {state.spinsLeft}
      </Text>
    </>
  );
}

/** The line under the reels that says what to do next. */
export function SlotHint({ unit, children }: { unit: number; children: string }): ReactElement {
  return (
    <Text
      accessibilityLiveRegion="polite"
      maxFontSizeMultiplier={1.2}
      style={[styles.hint, { top: HINT_TOP * unit, width: ARTBOARD.width * unit, fontSize: 14 * unit, lineHeight: 18 * unit }]}
      testID="slot-hint"
    >
      {children}
    </Text>
  );
}

export interface SlotDeckProps {
  unit: number;
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
export function SlotDeck({ unit, moves, tokens, label, accessibilityLabel, disabled, onPress, testID }: SlotDeckProps): ReactElement {
  const row = [styles.counterRow, { gap: 5 * unit }];
  const counter = [styles.counter, { fontSize: 18 * unit, lineHeight: 25 * unit }];
  return (
    <>
      <View accessibilityLabel={moves === null ? "No moves until the next spin" : `${moves} ${moves === 1 ? "move" : "moves"} left`} accessible style={[place(MOVES, unit), row]}>
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
        style={({ pressed }) => [place(PAY, unit), styles.pay, { borderRadius: 14 * unit }, disabled && styles.payDisabled, pressed && styles.pressed]}
        testID={testID}
      >
        <Text maxFontSizeMultiplier={1} style={[styles.payLabel, outlined(26 * unit, 30 * unit, "#1f6b1c")]}>
          {label}
        </Text>
      </Pressable>
      <View accessibilityLabel={`${tokens} tokens`} accessible style={[place(TOKENS, unit), row]}>
        <Text maxFontSizeMultiplier={1} style={counter} testID="slot-tokens">
          {tokens}
        </Text>
        <Coin size={17 * unit} />
      </View>
    </>
  );
}

/** The power shelf's four sockets: a held power's orb, or the lock on an empty socket. */
export function SlotPowerShelf({ unit, state }: { unit: number; state: SlotSpellerState }): ReactElement {
  const held = SLOT_POWERS.filter((power) => powerCount(state.powers, power.id) > 0);
  const size = Math.max(SOCKET * unit, 44);
  return (
    <>
      {SOCKETS.map((centre, index) => {
        const power = held[index];
        return (
          <Pressable
            key={centre}
            accessibilityLabel={power === undefined ? `Locked power slot ${index + 1}` : `${power.name} power, ready`}
            accessibilityRole="button"
            id={webTestID(`slot-socket-${index}`)}
            style={[styles.socket, { left: centre * unit - size / 2, top: (SOCKET_TOP + SOCKET / 2) * unit - size / 2, width: size, height: size }]}
            testID={`slot-socket-${index}`}
          >
            {power === undefined ? <Padlock size={28 * unit} /> : <Orb size={42 * unit} />}
          </Pressable>
        );
      })}
      <Text
        maxFontSizeMultiplier={1.2}
        style={[styles.caption, { top: SHELF_CAPTION_TOP * unit, width: ARTBOARD.width * unit, fontSize: 14 * unit, lineHeight: 18 * unit }]}
      >
        {`Powers · ${held.length} ready`}
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

function Orb({ size }: { size: number }): ReactElement {
  return (
    <Icon size={size} viewBox="0 0 38 38">
      <Defs>
        <RadialGradient cx="40%" cy="35%" id="slot-orb" r="65%">
          <Stop offset="0" stopColor="#fff3b0" />
          <Stop offset="0.55" stopColor="#f5bf3a" />
          <Stop offset="1" stopColor="#b9761a" />
        </RadialGradient>
      </Defs>
      <Circle cx={19} cy={20} fill="url(#slot-orb)" r={15} stroke="#8a5410" strokeWidth={1.5} />
      <Rect fill="#c98f1c" height={5} rx={1.5} stroke="#8a5410" strokeWidth={1.2} width={8} x={15} y={2.5} />
      <Path d="M21 11 L13.5 21.5 H18.5 L16.5 29 L24.5 18 H19.5 Z" fill="#ffffff" stroke="#8a5410" strokeLinejoin="round" strokeWidth={1.2} />
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
  pressed: { opacity: 0.7 },
  title: { margin: 0, textAlign: "center", fontFamily: fonts.ui, color: INK },
  meter: { overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 1, bottom: 1 },
  previewFill: { backgroundColor: "rgba(139,227,106,0.45)" },
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
