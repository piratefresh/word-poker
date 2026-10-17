import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, Keyframe, useReducedMotion } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { ShadowBox } from "@/components/ui/shadow-box";
import { fonts } from "@/constants/theme";
import { readItem, writeItem } from "@/lib/storage/claim-store";
import { webTestID } from "@/lib/ui/web-id";

import { ModeVariants, type ModeVariant } from "./mode-variants";
import { useTrayDismiss } from "./use-tray-dismiss";

const ENTER = FadeInDown.duration(500).easing(Easing.bezier(0.3, 1.25, 0.5, 1))
  .withInitialValues({ opacity: 0, transform: [{ translateY: 400 }] });
const EXIT = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: 400 }] },
}).duration(250);
const MODE_KEY = "offline-mode";
const SHADOW = [{ dy: 10, blur: 24, color: "rgba(0,0,0,0.65)" }];

/** Lives inside the Home scene, leaving the header and native tab rack interactive. */
export function OfflineTray<V extends ModeVariant>({ variants, onDeal, onClose, maxHeight }: {
  variants: readonly [V, ...V[]];
  onDeal: (variant: V) => void;
  onClose: () => void;
  maxHeight: number;
}) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState(() =>
    variants.find((variant) => variant.key === readItem(MODE_KEY)) ?? variants[0],
  );

  useTrayDismiss(onClose);

  return (
    <>
      <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(300)} exiting={reduceMotion ? undefined : FadeOut.duration(250)} style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close offline modes" testID="offline-backdrop" id={webTestID("offline-backdrop")} onPress={onClose} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <Animated.View entering={reduceMotion ? undefined : ENTER} exiting={reduceMotion ? undefined : EXIT} style={[styles.tray, { maxHeight }]} testID="offline-tray">
        <ShadowBox radius={18} shadows={SHADOW} />
        <View style={styles.wood}>
          <ScrollView bounces={false} contentContainerStyle={styles.felt}>
            <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%">
              <Defs><RadialGradient id="offline-felt" cx="50%" cy="25%" r="80%"><Stop offset="0" stopColor="#2a3a32" /><Stop offset="1" stopColor="#18231e" /></RadialGradient></Defs>
              <Rect width="100%" height="100%" fill="url(#offline-felt)" />
            </Svg>
            <View style={styles.heading}>
              <View style={styles.headingCopy}>
                <Text accessibilityRole="header" style={styles.title}>OFFLINE</Text>
                <Text style={styles.subline}>Practice vs bots · pick a mode</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close offline modes" onPress={onClose} testID="offline-close" id={webTestID("offline-close")} style={styles.close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <ModeVariants variants={variants} selectedKey={selected.key} onSelect={(variant) => {
              setSelected(variant);
              writeItem(MODE_KEY, variant.key);
            }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Deal ${selected.label}`} onPress={() => onDeal(selected)} testID="offline-deal" id={webTestID("offline-deal")} style={({ pressed }) => [styles.deal, pressed && styles.pressed]}>
              <LinearGradient colors={["#ffd877", "#e6a73e"]} style={styles.dealFace}>
                <Text style={styles.dealText}>{`DEAL · ${selected.label.toUpperCase()}`}</Text>
              </LinearGradient>
            </Pressable>
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
  subline: { fontFamily: "Rubik_500Medium", fontSize: 12, lineHeight: 18, color: "#d8ccaf" },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 28, lineHeight: 34, textAlign: "center", color: "#f7e7b5", width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.25)" },
  deal: { borderRadius: 12, overflow: "hidden", borderBottomWidth: 5, borderBottomColor: "#9a5f1c" },
  dealFace: { minHeight: 49, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  dealText: { fontFamily: fonts.arcade, fontSize: 21, color: "#39240f", textAlign: "center" },
  pressed: { opacity: 0.85, transform: [{ translateY: 2 }] },
});
