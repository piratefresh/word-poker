import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { ShadowBox } from "@/components/ui/shadow-box";
import { fonts } from "@/constants/theme";
import { webTestID } from "@/lib/ui/web-id";

import { useTrayDismiss } from "./use-tray-dismiss";

const ENTER = FadeInDown.duration(500).easing(Easing.bezier(0.3, 1.25, 0.5, 1))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 400 }] });
export const TRAY_EXIT_MS = 250;
const EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: 400 }] },
}).duration(TRAY_EXIT_MS);
const SHADOW = [{ dy: 10, blur: 24, color: "rgba(0,0,0,0.65)" }];

/**
 * The felt tray that rises over the dimmed street (STO-602, STO-643): backdrop, wood frame, and a
 * header with a close button. `id` prefixes the testIDs (`<id>-tray`, `<id>-backdrop`, `<id>-close`).
 */
export function TrayFrame({ id, title, subline, closeLabel, onClose, maxHeight, children }: {
  id: string;
  title: string;
  subline: string;
  closeLabel: string;
  onClose: () => void;
  maxHeight: number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  useTrayDismiss(onClose);

  return (
    <>
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)} exiting={reduceMotion ? undefined : FadeOut.duration(TRAY_EXIT_MS)} style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} testID={`${id}-backdrop`} id={webTestID(`${id}-backdrop`)} onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View entering={reduceMotion ? undefined : ENTER} exiting={reduceMotion ? undefined : EXIT} style={[styles.tray, { maxHeight }]} testID={`${id}-tray`}>
        <ShadowBox radius={18} shadows={SHADOW} />
        <View style={styles.wood}>
          <ScrollView bounces={false} contentContainerStyle={styles.felt}>
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs><RadialGradient id={`${id}-felt`} cx="50%" cy="25%" r="80%"><Stop offset="0" stopColor="#2a3a32" /><Stop offset="1" stopColor="#18231e" /></RadialGradient></Defs>
              <Rect width="100%" height="100%" fill={`url(#${id}-felt)`} />
            </Svg>
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text accessibilityRole="header" style={styles.title}>{title}</Text>
                <Text style={styles.subline}>{subline}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={onClose} testID={`${id}-close`} id={webTestID(`${id}-close`)} style={styles.close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            {children}
          </ScrollView>
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  // The rack overlaps this scene by 42pt and lifts Home another 6pt; 66 leaves an 18pt gap.
  tray: { position: "absolute", bottom: 66, left: 10, right: 10, alignSelf: "center", borderRadius: 18, borderWidth: 2, borderColor: "#b8703a", backgroundColor: "#6b3416" },
  wood: { borderWidth: 6, borderColor: "#6b3416", borderRadius: 16, overflow: "hidden" },
  felt: { padding: 12, gap: 12, backgroundColor: "#18231e" },
  heading: { flexDirection: "row", alignItems: "center", gap: 4 },
  headingCopy: { flex: 1 },
  title: { fontFamily: fonts.arcade, fontSize: 25, color: "#f7e7b5" },
  subline: { fontFamily: fonts.rubikMedium, fontSize: 12, lineHeight: 18, color: "#d8ccaf" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 28, lineHeight: 34, textAlign: "center", color: "#f7e7b5", width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.25)" },
});
