import type { UniversalStyle } from "@expo/ui";
import { fillMaxWidth } from "@expo/ui/jetpack-compose/modifiers";

import type { FullWidthProps } from "./full-width";

/** Compose only takes a `width` in dp, so the full width is a modifier instead of a style. */
export function fullWidth(style: UniversalStyle = {}): FullWidthProps {
  const { width: _width, ...rest } = style;
  return { style: rest, modifiers: [fillMaxWidth()] as never[] };
}
