import type { ViewStyle } from "react-native";

/** Native brightness filters paint an opaque layer over transparent button corners. */
export function menuFeedback(_hovered: boolean, _pressed: boolean): ViewStyle {
  return { cursor: "pointer" };
}
