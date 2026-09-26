import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { SharedValue } from "react-native-reanimated";

interface IMeshGradientColor {
  r: number;
  g: number;
  b: number;
}

interface IFrameBack {
  fpsLock: number;
  animated: boolean;
  /** A shared value is read every frame, so the pace can change without re-arming the callback. */
  speed: number | SharedValue<number>;
}

interface IPerformance {
  undersampling?: number;
  fpsLock?: number;
}

interface IAnimatedMeshGradient {
  readonly performance?: IPerformance;
  readonly colors?: IMeshGradientColor[];
  readonly speed?: number;
  readonly noise?: number;
  readonly blur?: number;
  readonly contrast?: number;
  /** Finishes as painted felt (vignette, emerald glow, strokes, still grain); otherwise as the stock mesh. */
  readonly painted?: boolean;
  readonly animated?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly width?: number;
  readonly height?: number;
  readonly children?: React.ReactNode;
}

export type {
  IAnimatedMeshGradient,
  IFrameBack,
  IMeshGradientColor,
  IPerformance,
};
