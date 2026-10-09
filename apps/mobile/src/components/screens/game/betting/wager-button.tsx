import { useAudioPlayer } from "expo-audio";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop, Text, TextPath } from "react-native-svg";
import { useEffect, useId, useRef, useState } from "react";

import type { TurnTimerView } from "@/components/hud/turn-clock";
import { ArcadeDigits } from "@/components/hud/top-bar/arcade-digits";
import { haptic } from "@/components/word-builder/haptics";
import { fonts, opacity } from "@/constants/theme";
import { webTestID } from "@/lib/web-id";

import { WagerArt } from "./wager-art";
import { WaitingShield } from "./waiting-shield";

const CLICK = require("../../../../../assets/images/ui/v2/button/raise-press.mp3");
const YOUR_TURN = require("../../../../../assets/images/ui/v2/button/your-turn.mp3");
const ART_SIZE = 1280;
/** How far below the old housing's face the Rive button's face sits, in lettering units. */
const FACE_DROP = 90;
const EASING = Easing.out(Easing.cubic);

/** The lettering's two homes: above an amount (or a waited-on name), or centred on a bare face. */
const ARC_AMOUNT = "M 340 445 Q 640 335 940 445";
const ARC_LABEL = "M 340 595 Q 640 485 940 595";

/** The waited-on name is fitted to the amount slot: proportional caps, shrinking as names grow. */
function nameSize(name: string): number {
  return Math.min(200, 1100 / Math.max(2, name.length));
}

/** The refusal wiggle, in points: a nudge either way, over before it reads as motion. */
function wiggle(amplitude: number) {
  return withSequence(
    withTiming(-amplitude, { duration: 25, easing: EASING }),
    withTiming(amplitude, { duration: 40, easing: EASING }),
    withTiming(-amplitude / 2, { duration: 40, easing: EASING }),
    withTiming(0, { duration: 50, easing: EASING }),
  );
}

/** The artwork stays fixed; its inset face and lettering share one press-and-release beat. */
export function WagerButton({
  amount,
  label,
  size = 108,
  disabled = false,
  soundEnabled = true,
  onPress,
  testID,
  waitingOn,
}: {
  amount?: string;
  label: "BET" | "RAISE" | "RAISE TO" | "CHECK" | "CALL";
  size?: number;
  disabled?: boolean;
  soundEnabled?: boolean;
  onPress?: () => void;
  testID?: string;
  /**
   * The off-turn face: the button waits on the seat that acts — WAITING and its name, under the
   * glass shield. Present only while the table waits elsewhere; the hero's
   * own turn keeps the live face, illegal actions included.
   */
  waitingOn?: {
    /** The acting seat's name; omitted when nobody acts (between streets, payout). */
    name?: string;
    /** The acting seat's countdown, read from the table's one turn clock. */
    view?: TurnTimerView;
  };
}) {
  const id = useId().replace(/:/g, "");
  const arcId = `wager-arc-${id}`;
  const goldId = `wager-gold-${id}`;
  const unit = size / ART_SIZE;
  const offTurn = waitingOn !== undefined;
  const face = offTurn ? "WAITING" : label;
  const waitingName = offTurn ? waitingOn?.name : undefined;
  const labelSize = offTurn ? 116 : label === "RAISE TO" ? 90 : amount == null ? 140 : 116;
  const reduceMotion = useReducedMotion();
  const press = useSharedValue(0);
  const shake = useSharedValue(0);
  const pop = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const wasOffTurn = useRef(false);
  const player = useAudioPlayer(CLICK);
  const cuePlayer = useAudioPlayer(YOUR_TURN);
  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.get() }, { scale: pop.get() }],
  }));
  const letteringStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (FACE_DROP + press.get() * 75) * unit },
      { scale: 1 - press.get() * 0.1 },
    ],
  }));

  // The pop-in marks the hero's turn arriving — once per turn, never per re-render: the ref holds
  // whether the table was waiting elsewhere, so only the crossing fires it, and a wait that
  // merely changes seats crosses nothing. A wait that ends in the tutorial's hold (disabled) is
  // not a turn arriving.
  useEffect(() => {
    const arrived = wasOffTurn.current && !offTurn && !disabled;
    wasOffTurn.current = offTurn;
    if (!arrived) return;
    if (!reduceMotion) {
      pop.set(withSequence(
        withTiming(0.84, { duration: 0 }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.back(1.7)) }),
      ));
    }
    haptic("settle");
  }, [offTurn, disabled, reduceMotion, pop]);

  function handlePress() {
    if (offTurn) {
      // The wait answers a tap — a light shake and the not-your-turn sound — but sends nothing.
      if (!reduceMotion) shake.set(wiggle(1));
      if (soundEnabled) {
        try {
          // eslint-disable-next-line react-hooks/immutability
          cuePlayer.volume = 0.5;
          void cuePlayer.seekTo(0).catch(() => {});
          cuePlayer.play();
        } catch {}
      }
      return;
    }
    if (disabled) return;
    if (!reduceMotion) {
      shake.set(withDelay(70, wiggle(1.5)));
      haptic("settle");
    }
    if (soundEnabled) {
      // Feedback is optional: a refused audio session must never prevent a wager.
      try {
        // Expo's native AudioPlayer exposes volume through an imperative setter.
        // eslint-disable-next-line react-hooks/immutability
        player.volume = 0.45;
        void player.seekTo(0).catch(() => {});
        player.play();
      } catch {}
    }
    onPress?.();
  }

  // The housing sinks while a finger holds it and rises on release — the Rive file's own press —
  // and the lettering rides down with it. A wait or a disabled button doesn't sink.
  function pressTo(down: boolean) {
    if (down && (offTurn || disabled)) return;
    setPressed(down);
    if (!reduceMotion) press.set(withTiming(down ? 1 : 0, { duration: down ? 80 : 160, easing: EASING }));
  }

  // Off-turn the button stays pressable — the tap earns a shake — while the accessibility
  // state below says disabled; the held or illegal-action look keeps the native gate.
  return (
    <Pressable
      accessibilityLabel={offTurn
        ? waitingName == null ? "Waiting" : `Waiting for ${waitingName}`
        : amount == null ? "Check" : `${label === "BET" ? "Bet" : label === "CALL" ? "Call" : "Raise to"} ${amount}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || offTurn }}
      disabled={disabled && !offTurn ? true : undefined}
      onPress={handlePress}
      onPressIn={() => pressTo(true)}
      onPressOut={() => pressTo(false)}
      style={{
        width: size,
        height: size,
        opacity: disabled && !offTurn ? opacity.disabled : 1,
        // Web only: RN types the cursor as auto | pointer, but react-native-web passes any CSS value.
        cursor: offTurn || disabled ? ("not-allowed" as "auto") : "pointer",
      }}
      testID={testID}
      id={webTestID(testID)}
    >
      <Animated.View pointerEvents="none" style={[styles.art, buttonStyle]}>
        <WagerArt pressed={pressed} size={size} />
        <Animated.View style={[styles.art, letteringStyle]}>
          <Svg width={size} height={size} viewBox={`0 0 ${ART_SIZE} ${ART_SIZE}`}>
            <Defs>
              <Path id={arcId} d={offTurn || amount != null ? ARC_AMOUNT : ARC_LABEL} />
              <LinearGradient id={goldId} x1="0" y1="280" x2="0" y2="460" gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#fff8ce" />
                <Stop offset="0.55" stopColor="#ffe9a5" />
                <Stop offset="1" stopColor="#e1a33e" />
              </LinearGradient>
            </Defs>
            <Text fontFamily={fonts.serifBold} fontSize={labelSize} textAnchor="middle" fill="#10184c" dy={12} dx={4}>
              <TextPath href={`#${arcId}`} startOffset="50%">{face}</TextPath>
            </Text>
            <Text fontFamily={fonts.serifBold} fontSize={labelSize} textAnchor="middle"
              fill={`url(#${goldId})`} stroke="#f7c35a" strokeWidth={2}>
              <TextPath href={`#${arcId}`} startOffset="50%">{face}</TextPath>
            </Text>
          </Svg>
          {waitingName != null ? (
            <View style={[styles.amount, { top: 420 * unit, left: 310 * unit, width: 660 * unit }]}>
              <RNText numberOfLines={1} style={[styles.waitingName, { fontSize: nameSize(waitingName) * unit }]}>
                {waitingName}
              </RNText>
            </View>
          ) : amount != null && (
            <View style={[styles.amount, { top: 420 * unit, left: 310 * unit, width: 660 * unit }]}>
              <ArcadeDigits style={{
                fontSize: Math.min(270, 900 / Math.max(3, amount.length)) * unit,
                lineHeight: 290 * unit,
              }}>{amount}</ArcadeDigits>
            </View>
          )}
        </Animated.View>
        <WaitingShield active={offTurn} size={size} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  art: { ...StyleSheet.absoluteFill },
  amount: { position: "absolute", alignItems: "center", justifyContent: "center" },
  waitingName: { color: "#ffe9a5", fontFamily: fonts.serifBold, textAlign: "center" },
});
