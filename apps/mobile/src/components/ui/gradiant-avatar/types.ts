import type React from "react";
import type { StyleProp, ViewStyle } from "react-native";

type Scheme =
  | "analogous"
  | "triadic"
  | "splitComplementary"
  | "tetradic"
  | "complementary"
  | "custom";

interface IPalette {
  seed: number;
  swatches: string[];
  scheme: Scheme;
}

interface IPaletteConfig {
  palette?: string[];
}

interface IMesh {
  fill: string;
  layers: string[];
}

interface IGradientAvatar {
  token: number | string;
  size?: number;
  rounding?: number;
  palette?: string[];
  sheen?: boolean;
  /** Swirls the mesh slowly, e.g. while the seat it stands for is acting. */
  animated?: boolean;
  /** Drawn over the mesh, e.g. the seat's initials. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export type { IGradientAvatar, IMesh, IPalette, IPaletteConfig, Scheme };
