import type { PropsWithChildren } from "react";
import { View } from "react-native";

/** Mouse tracking is web-only; native keeps the same entrance and layout. */
export function LogoTilt({ width, children }: PropsWithChildren<{ width: number }>) {
  return <View style={{ width }}>{children}</View>;
}
