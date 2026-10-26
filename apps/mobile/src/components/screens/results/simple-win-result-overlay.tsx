import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState, type ReactElement } from "react";
import { Modal, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";
import { GameButton } from "@/components/ui/game-button";
import { gradients } from "@/constants/theme";

import type { ResultsSnapshot } from "./results-types";
import { SimpleWinResultRive } from "./simple-win-result-rive";

export function SimpleWinResultOverlay({ snapshot, onComplete }: {
  snapshot: ResultsSnapshot;
  onComplete: () => void;
}): ReactElement | null {
  const reducedMotion = useReducedMotion();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const scale = Math.max(0, Math.min(viewport.width / 420, (viewport.height - 82) / 480, 1));
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => current.width === width && current.height === height
      ? current : { width, height });
  }, []);

  if (!snapshot.seats.some((seat) => seat.takesPot)) return null;
  return (
    <Modal supportedOrientations={MODAL_ORIENTATIONS} transparent visible statusBarTranslucent navigationBarTranslucent>
      <View accessibilityViewIsModal
        onLayout={onLayout} style={styles.overlay} testID="simple-win-overlay">
        <LinearGradient {...gradients.felt} pointerEvents="none" style={styles.backdrop} />
        {scale > 0 ? (
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            pointerEvents="none" style={{ height: 480 * scale, width: 420 * scale }}>
            <SimpleWinResultRive key={`${snapshot.hand}:${reducedMotion}`} snapshot={snapshot} reducedMotion={reducedMotion} />
          </View>
        ) : null}
        <GameButton label="Continue" onPress={onComplete}
          style={styles.continueButton} testID="simple-win-continue" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 16,
  },
  backdrop: { ...StyleSheet.absoluteFill, opacity: 0.85 },
  continueButton: { minWidth: 160 },
});
