import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  FadeOutUp,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";

import { POWER_UPS } from "@wordpoker/contracts";

import { useScreenScale } from "@/components/screens/game/screen-scale";
import { colors, fonts, spacing } from "@/constants/theme";
import type { PowerUsedNotice } from "@/features/table/power-view";
import { webTestID } from "@/lib/web-id";

import { PowerCard } from "./power-card";

/**
 * The card's beat, in ms: it rises in, holds long enough to read the title and the line, and
 * clears. The next card in the queue — and the hero's own swap flip — wait for the clear.
 */
export const POWER_USED_BEATS = { enterMs: 280, holdMs: 1_500, exitMs: 220 } as const;

/**
 * The card's way in and out. It rises into the middle of the felt and drifts on up as it clears;
 * under reduced motion it only fades. The fade is told to play whatever the system says, because
 * the system's reduced motion would otherwise skip it and the card would blink in and out.
 */
export const POWER_USED_MOTION = {
  rise: {
    entering: FadeInUp.duration(POWER_USED_BEATS.enterMs).easing(Easing.out(Easing.back(1.4))),
    exiting: FadeOutUp.duration(POWER_USED_BEATS.exitMs),
  },
  fade: {
    entering: FadeIn.duration(POWER_USED_BEATS.enterMs).reduceMotion(ReduceMotion.Never),
    exiting: FadeOut.duration(POWER_USED_BEATS.exitMs).reduceMotion(ReduceMotion.Never),
  },
} as const;

/**
 * §44's public side of a power: whoever used one, every seat sees it in the middle of the felt —
 * the power's card and "<name> used" — and never what it gave. The card plays the adapter's queue
 * (`PowerView.used`) one notice at a time and reports each back through `onDone` once it has
 * cleared, which is what moves the queue on.
 *
 * Drawn in `GameScreen`'s `overFelt`. It takes no input: the felt under it and the action row
 * stay live while it plays, since the seat that used the power is still on its turn.
 */
export function PowerUsedCard({
  notices,
  onDone,
  reduceMotion,
}: {
  notices: readonly PowerUsedNotice[];
  onDone: (notice: PowerUsedNotice) => void;
  /** Overrides the OS reduced-motion value; the tests use it. */
  reduceMotion?: boolean;
}) {
  const systemReduce = useReducedMotion();
  const current = notices[0];
  if (current === undefined) return null;

  return (
    <UsedNotice
      // One seat uses one power a hand, so the hand and the seat name a card: a new one remounts
      // and plays its own beat, while a fresh copy of the same one re-rendered leaves it running.
      key={`${current.handId}:${current.seat}`}
      notice={current}
      onDone={onDone}
      reduce={reduceMotion ?? systemReduce}
    />
  );
}

function UsedNotice({
  notice,
  onDone,
  reduce,
}: {
  notice: PowerUsedNotice;
  onDone: (notice: PowerUsedNotice) => void;
  reduce: boolean;
}) {
  const scale = useScreenScale();
  const [leaving, setLeaving] = useState(false);
  const power = POWER_UPS[notice.powerUpId];
  const who = notice.mine ? "You" : notice.name;
  const lit = notice.letter;
  const said = lit === undefined ? `${who} used ${power.title}` : `${who} spotlighted the ${lit}`;

  // The beat runs once per card, whatever the felt re-renders with in the meantime: the latest
  // notice and handler are read when the clear lands, not when it was armed.
  const latest = useRef({ notice, onDone });
  useEffect(() => {
    latest.current = { notice, onDone };
  });
  useEffect(() => {
    const { enterMs, holdMs, exitMs } = POWER_USED_BEATS;
    const leave = setTimeout(() => setLeaving(true), enterMs + holdMs);
    const done = setTimeout(() => latest.current.onDone(latest.current.notice), enterMs + holdMs + exitMs);
    return () => {
      clearTimeout(leave);
      clearTimeout(done);
    };
  }, []);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(said);
  }, [said]);

  const motion = reduce ? POWER_USED_MOTION.fade : POWER_USED_MOTION.rise;

  return (
    <View pointerEvents="none" style={styles.layer} testID="power-used-layer">
      {leaving ? null : (
        <Animated.View
          accessibilityLabel={`${said}: ${power.description}`}
          accessibilityLiveRegion="polite"
          entering={motion.entering}
          exiting={motion.exiting}
          id={webTestID("power-used")}
          style={styles.card}
          testID="power-used"
        >
          <Text style={[styles.caption, { fontSize: 15 * scale }]}>{lit === undefined ? `${who.toUpperCase()} USED` : `${who.toUpperCase()} SPOTLIGHTED THE ${lit}`}</Text>
          <PowerCard id={notice.powerUpId} width={Math.round(104 * scale)} />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * The felt's region, spelled out: `StyleSheet.absoluteFill` is a registered style on the web and
 * spreads to nothing there.
 */
const FILL = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

const styles = StyleSheet.create({
  layer: { ...FILL, alignItems: "center", justifyContent: "center", zIndex: 15 },
  card: { alignItems: "center", gap: spacing.xs },
  caption: {
    color: colors.goldHi,
    fontFamily: fonts.arcade,
    letterSpacing: 1,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { height: 2, width: 0 },
    textShadowRadius: 4,
  },
});
