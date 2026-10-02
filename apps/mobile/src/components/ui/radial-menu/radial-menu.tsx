import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

type RadialActionDef = { id: string; icon: any; title: string };

const BUTTON_RADIUS = 28;
const DEFAULT_RADIUS = 96;
const DEFAULT_ANGLE_STEP_DEG = 40;
const BASE_ICON_SIZE = 22;

function lerpAngle(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function RadialButton({
  button,
  pressX,
  pressY,
  cursorX,
  cursorY,
  animationProgress,
  hoveredId,
}: {
  button: { id: string; icon: any; pos: { x: number; y: number } };
  pressX: number;
  pressY: number;
  cursorX: SharedValue<number>;
  cursorY: SharedValue<number>;
  animationProgress: SharedValue<number>;
  hoveredId: SharedValue<string | null>;
}) {
  const [currentIconSize, setCurrentIconSize] = useState(BASE_ICON_SIZE);
  const Icon = button.icon;

  const proximityScale = useDerivedValue(() => {
    const cx = cursorX?.get() ?? pressX;
    const cy = cursorY?.get() ?? pressY;
    const dx = cx - button.pos.x;
    const dy = cy - button.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normalized = Math.max(0, Math.min(1, 1 - dist / (BUTTON_RADIUS * 2)));
    return 1 + normalized * 0.4;
  });

  useAnimatedReaction(
    () => proximityScale.get() * BASE_ICON_SIZE,
    (size) => {
      runOnJS(setCurrentIconSize)(Math.round(size));
    },
  );

  const animatedButtonStyle = useAnimatedStyle(() => {
    const progress = animationProgress.get();
    const startX = pressX - BUTTON_RADIUS;
    const startY = pressY - BUTTON_RADIUS;
    const endX = button.pos.x - BUTTON_RADIUS;
    const endY = button.pos.y - BUTTON_RADIUS;

    const currentX = startX + (endX - startX) * progress;
    const currentY = startY + (endY - startY) * progress;

    const cx = cursorX?.get() ?? pressX;
    const cy = cursorY?.get() ?? pressY;
    const dx = cx - button.pos.x;
    const dy = cy - button.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normalized = Math.max(0, Math.min(1, 1 - dist / (BUTTON_RADIUS * 2)));
    const proximity = 1 + normalized * 0.4;
    const scale = progress * proximity;
    const opacity = progress;

    const vx = endX - startX;
    const vy = endY - startY;
    const vlen = Math.max(1, Math.sqrt(vx * vx + vy * vy));
    const closeness = Math.max(0, Math.min(1, (proximity - 1) / 0.4));
    const eased = closeness * closeness;
    const offset = 32 * eased * progress;
    const adjX = currentX + (vx / vlen) * offset;
    const adjY = currentY + (vy / vlen) * offset;

    const baseSize = BUTTON_RADIUS * 2;
    return {
      position: "absolute" as const,
      left: adjX,
      top: adjY,
      opacity,
      width: baseSize * scale,
      height: baseSize * scale,
      borderRadius: baseSize * scale,
    };
  });

  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: hoveredId.get() === button.id ? 1 : 0,
    position: "absolute" as const,
  }));

  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: hoveredId.get() === button.id ? 0 : 1,
    position: "absolute" as const,
  }));

  return (
    <Animated.View
      style={[
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "white",
        },
        animatedButtonStyle,
      ]}
    >
      <Animated.View style={activeIconStyle}>
        <Icon size={currentIconSize} color="#000000" />
      </Animated.View>
      <Animated.View style={inactiveIconStyle}>
        <Icon size={currentIconSize} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

export function RadialMenu({
  pressX,
  pressY,
  cursorX,
  cursorY,
  releaseSignal,
  actions,
  onSelect,
  onCancel,
  radius = DEFAULT_RADIUS,
  angleStepDeg = DEFAULT_ANGLE_STEP_DEG,
}: {
  pressX: number;
  pressY: number;
  cursorX: SharedValue<number>;
  cursorY: SharedValue<number>;
  releaseSignal: SharedValue<number>;
  actions: RadialActionDef[];
  onSelect: (id: string) => void;
  onCancel: () => void;
  radius?: number;
  angleStepDeg?: number;
}) {
  const { width, height } = Dimensions.get("window");
  const animationProgress = useSharedValue(0);
  const hoveredId = useSharedValue<string | null>(null);
  const lastHapticId = useSharedValue<string | null>(null);
  const hasAnimatedIn = useRef(false);

  useEffect(() => {
    if (!hasAnimatedIn.current) {
      hasAnimatedIn.current = true;
      animationProgress.set(withSpring(1, { damping: 80 }));
    }
  }, [animationProgress]);

  const baseAngleDeg = useMemo(() => {
    const cx = width / 2;
    const isTopSixth = pressY < height / 4;
    const isCenterBand = Math.abs(pressX - cx) < width * 0.1;

    const centerAngle = isTopSixth ? 180 : 0;
    const leftFar = isTopSixth ? 230 : 310;
    const rightFar = isTopSixth ? 120 : 60;

    const dxNorm = Math.min(1, Math.abs(pressX - cx) / (width / 2));

    let userAngle: number;
    if (isCenterBand) {
      userAngle = centerAngle;
    } else if (pressX < cx) {
      userAngle = lerpAngle(centerAngle, leftFar, dxNorm);
    } else {
      userAngle = lerpAngle(centerAngle, rightFar, dxNorm);
    }

    return (270 - userAngle + 360) % 360;
  }, [pressX, pressY, width, height]);

  const anglesDeg = useMemo(() => {
    const count = actions.length;
    if (count === 1) return [baseAngleDeg];
    const half = (count - 1) / 2;
    return Array.from(
      { length: count },
      (_, i) => baseAngleDeg + (i - half) * angleStepDeg,
    );
  }, [baseAngleDeg, actions.length, angleStepDeg]);

  const toXY = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: pressX + radius * Math.cos(rad),
      y: pressY + radius * Math.sin(rad),
    };
  };

  const buttons = actions.map((action, i) => ({
    id: action.id,
    icon: action.icon,
    pos: toXY(anglesDeg[i]),
  }));

  const buttonCenters = buttons.map((b) => ({
    id: b.id,
    x: b.pos.x,
    y: b.pos.y,
  }));

  // Hover detection
  useAnimatedReaction(
    () => (cursorX && cursorY ? { x: cursorX.get(), y: cursorY.get() } : null),
    (pos) => {
      if (!pos) return;
      let nearestId: string | null = null;
      let nearestDist2 = Infinity;
      const threshold2 = (BUTTON_RADIUS * 3) ** 2;

      for (let i = 0; i < buttonCenters.length; i++) {
        const b = buttonCenters[i];
        const dx = pos.x - b.x;
        const dy = pos.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < nearestDist2) {
          nearestDist2 = dist2;
          nearestId = b.id;
        }
      }

      const active = nearestId && nearestDist2 <= threshold2 ? nearestId : null;

      if (hoveredId.get() !== active) {
        hoveredId.set(active);
        if (active && lastHapticId.get() !== active) {
          lastHapticId.set(active);
          runOnJS(Haptics.selectionAsync)();
        } else if (!active) {
          lastHapticId.set(null);
        }
      }
    },
  );

  // Release signal
  useAnimatedReaction(
    () => (releaseSignal ? releaseSignal.get() : -1),
    (val, prev) => {
      if (val === -1 || prev == null || val === prev) return;
      if (hoveredId.get()) {
        runOnJS(Haptics.selectionAsync)();
        runOnJS(onSelect)(hoveredId.get()!);
      } else {
        runOnJS(onCancel)();
      }
    },
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {buttons.map((button) => (
        <RadialButton
          key={button.id}
          button={button}
          pressX={pressX}
          pressY={pressY}
          cursorX={cursorX}
          cursorY={cursorY}
          animationProgress={animationProgress}
          hoveredId={hoveredId}
        />
      ))}
    </View>
  );
}
