/**
 * xp-result-overlay.tsx — the non-winner's post-hand XP moment (STO-573).
 *
 * Placement → bar → "You earned +N XP" → distance to the next level → breakdown → Continue, over
 * the existing table under a dark scrim. React owns every word and number; the bar animates a 0–100 `progress`.
 * The reward shown is a prediction from `game-rules` until the claim
 * the hand queued is answered, then the server's total replaces it (`xp-overlay-model.ts`).
 */

import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  AccessibilityInfo,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { levelForXp } from "@wordpoker/game-rules";

import { fonts, palette } from "@/constants/theme";
import { useQuests, type HandReport } from "@/lib/quests-provider";
import { webTestID } from "@/lib/web-id";

import type { ResultsSeat } from "./results-types";
import { placementLabel, xpBreakdown, xpSteps, xpView } from "./xp-overlay-model";
import { XpBar, XP_BAR_ASPECT } from "./xp-bar";

const PLACEMENT_PILL = require("../../../../assets/images/ui/v2/placement-pill-blank.png");

/** Content eases in over 250 ms, then the journey advances one step per 450 ms. */
const ENTRANCE_MS = 250;
const STEP_MS = 450;

export function XpResultOverlay({ hero, report, onComplete }: {
  hero: ResultsSeat;
  report: HandReport | null;
  onComplete: () => void;
}): ReactElement {
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const compact = width > height;
  const { claimOutcomes } = useQuests();
  const { participation, word, total } = xpBreakdown(hero);
  const view = xpView(report, total, claimOutcomes ?? {});
  const place = placementLabel(hero.place);

  // Steps are rebuilt only when the journey itself changes, so a confirmation that agrees with
  // the prediction does not restart the bar.
  const steps = useMemo(
    () => (view.fromXp === null || view.toXp === null ? [] : xpSteps(view.fromXp, view.toXp)),
    [view.fromXp, view.toXp],
  );
  // The index belongs to the journey it was reached on, so a new journey starts again at 0.
  const [reached, setReached] = useState<{ steps: typeof steps; index: number }>({ steps, index: 0 });
  useEffect(() => {
    if (reducedMotion) return;
    const timers = steps.slice(1).map((_, index) =>
      setTimeout(() => setReached({ steps, index: index + 1 }), ENTRANCE_MS + STEP_MS * (index + 1)),
    );

    return () => timers.forEach(clearTimeout);
  }, [reducedMotion, steps]);
  const stepIndex = reducedMotion ? steps.length - 1 : reached.steps === steps ? reached.index : 0;
  const step = steps[stepIndex] ?? { level: 1, progress: 0 };

  // Once the bar reaches its final step, scroll the Continue button into view for the viewer.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const settleMs = reducedMotion ? 0 : ENTRANCE_MS + STEP_MS * Math.max(steps.length - 1, 0);
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), settleMs);
    return () => clearTimeout(timer);
  }, [reducedMotion, steps]);

  const entrance = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) entrance.set(withTiming(1, { duration: ENTRANCE_MS, easing: Easing.out(Easing.cubic) }));
  }, [entrance, reducedMotion]);
  const content = useAnimatedStyle(() => ({
    opacity: entrance.get(),
    transform: [{ translateY: (1 - entrance.get()) * 24 }],
  }));

  const awayLine = view.toXp === null ? null : (() => {
    const { level, toNext } = levelForXp(view.toXp);
    return `${toNext} XP away from Level ${level + 1}`;
  })();
  const headline = `You earned +${total} XP`;
  const announcement = view.sync === "signed-out" ? `${place}. Sign in and verify your account to earn XP.` : `${place}. ${headline}.`;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(announcement);
    // Once per mount: the announcement is the hand's, not the sync state's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Modal transparent visible statusBarTranslucent navigationBarTranslucent>
      <View accessibilityViewIsModal style={styles.backdrop} testID="xp-result-overlay">
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <Animated.View style={[styles.content, compact && styles.contentCompact, content]}>
            <View accessible accessibilityLabel={place} style={[styles.pill, compact && styles.pillCompact]}>
              <Image accessible={false} resizeMode="contain" source={PLACEMENT_PILL} style={styles.pillArt} />
              <Text style={styles.pillText}>{place}</Text>
            </View>

            {view.sync === "signed-out" ? (
              <Text style={styles.notice} testID="xp-sign-in-notice">
                Sign in and verify your account to earn XP
              </Text>
            ) : (
              <>
                <View
                  accessibilityLabel="Level progress"
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(step.progress) }}
                  style={[styles.bar, compact && styles.barCompact]}
                >
                  <XpBar key={step.level} progress={step.progress} reducedMotion={reducedMotion} />
                </View>
                <Text accessibilityRole="header" style={[styles.headline, compact && styles.headlineCompact]}>
                  You earned <Text style={styles.reward}>+{total} XP</Text>
                </Text>
                {awayLine === null ? null : (
                  <Text style={[styles.away, compact && styles.awayCompact]}>{awayLine}</Text>
                )}
                <Text style={styles.sync} testID="xp-sync-note">
                  {view.sync === "pending" ? "XP pending sync"
                    : view.sync === "rejected" ? "XP could not be saved" : " "}
                </Text>
              </>
            )}

            <View style={[styles.panel, compact && styles.panelCompact]}>
              <LinearGradient
                pointerEvents="none"
                colors={["rgba(109, 49, 10, 0.88)", "rgba(63, 24, 4, 0.94)"]}
                style={StyleSheet.absoluteFill}
              />
              <Row label="Participation" value={participation} compact={compact} />
              <View style={styles.divider} />
              <Row label="Word bonus" value={word} compact={compact} />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue"
              onPress={onComplete}
              id={webTestID("xp-result-continue")}
              testID="xp-result-continue"
              style={({ pressed }) => [
                styles.continue,
                compact && styles.continueCompact,
                pressed && styles.continuePressed,
              ]}
            >
              <LinearGradient
                colors={["#36c9ff", "#069cff", "#0074dd"]}
                style={[styles.continueFace, compact && styles.continueFaceCompact]}
              >
                <Text style={styles.continueText}>CONTINUE</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({ label, value, compact }: { label: string; value: number; compact: boolean }): ReactElement {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <Text style={styles.rowLabel}>{label}:</Text>
      <Text style={styles.rowValue}>+{value} XP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(18, 8, 3, 0.76)" },
  scroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  content: { width: "100%", maxWidth: 440, alignItems: "center", gap: 18 },
  contentCompact: { maxWidth: 320, gap: 8 },
  pill: { width: 240, maxWidth: "100%", height: 80, alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 16 },
  pillCompact: { width: 160, height: 54, marginBottom: 0 },
  pillArt: { position: "absolute", width: "100%", height: "100%", top: 0, left: 0 },
  pillText: {
    fontFamily: fonts.ui, fontSize: 24, letterSpacing: 1, color: "#fff5df",
    textShadowColor: "#4b2006", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  bar: { width: "100%", aspectRatio: XP_BAR_ASPECT, marginBottom: 4 },
  barCompact: { marginBottom: 0 },
  headline: {
    fontFamily: fonts.ui, fontSize: 36, color: "#fff5df", textAlign: "center",
    textShadowColor: "#492006", textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 2,
  },
  headlineCompact: { fontSize: 22 },
  reward: { color: "#ffd52a" },
  away: {
    fontFamily: fonts.uiMedium, fontSize: 21, color: "#fff0d4", textAlign: "center",
    textShadowColor: "#492006", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 2,
  },
  awayCompact: { fontSize: 14 },
  sync: { fontFamily: fonts.sansMedium, fontSize: 12, color: palette.cream100, textAlign: "center" },
  notice: { fontFamily: fonts.uiMedium, fontSize: 20, color: palette.cream100, textAlign: "center" },
  panel: {
    width: "100%", paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 18, borderWidth: 2, borderColor: "#bd742b", overflow: "hidden",
    boxShadow: "0px 4px 8px rgba(49, 17, 2, 0.4)",
  },
  panelCompact: { paddingHorizontal: 14, paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 14 },
  rowCompact: { paddingVertical: 6 },
  divider: { height: 1, backgroundColor: "rgba(235, 166, 72, 0.35)" },
  rowLabel: { flexShrink: 1, fontFamily: fonts.uiMedium, fontSize: 21, color: "#fff0d4" },
  rowValue: { fontFamily: fonts.ui, fontSize: 23, color: "#ffd52a" },
  continue: {
    width: "100%", marginTop: 12, paddingBottom: 6, borderRadius: 18, backgroundColor: "#003b79",
    borderWidth: 2, borderColor: "#002d59", boxShadow: "0px 4px 6px rgba(35, 13, 1, 0.5)",
  },
  continueCompact: { marginTop: 4 },
  continuePressed: { paddingBottom: 2, paddingTop: 4 },
  continueFace: {
    minHeight: 64, padding: 14, justifyContent: "center", alignItems: "center",
    borderRadius: 15, borderWidth: 2, borderColor: "#72ddff",
    boxShadow: "inset 0px 2px 0px rgba(255, 255, 255, 0.65)",
  },
  continueFaceCompact: { minHeight: 44, padding: 8 },
  continueText: {
    fontFamily: fonts.ui, fontSize: 27, letterSpacing: 1, color: "#fff5df", textAlign: "center",
    textShadowColor: "#00509a", textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 1,
  },
});
