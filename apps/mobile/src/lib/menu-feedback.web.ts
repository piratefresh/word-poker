import type { ViewStyle } from "react-native";

/** Hover brightens, press darkens; the caller's transform (the menu's tilt) is left alone. */
export function menuFeedback(hovered: boolean, pressed: boolean): ViewStyle {
  return {
    cursor: "pointer",
    filter: `brightness(${pressed ? 0.94 : hovered ? 1.06 : 1})`,
    transitionProperty: "filter",
    transitionDuration: "150ms",
    transitionTimingFunction: "ease",
  };
}
