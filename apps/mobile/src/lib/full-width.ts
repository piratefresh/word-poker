import type { UniversalStyle } from "@expo/ui";

/** The props that make an `@expo/ui` view as wide as its parent. */
export type FullWidthProps = {
  style: UniversalStyle;
  modifiers?: never[];
};

/**
 * `style` widened to its parent, spread onto an `@expo/ui` view: `<Row {...fullWidth(style)} />`.
 *
 * A percentage `width` is fine on iOS and the web, but Android's style transform casts `width` to a
 * number and hands Compose the string, which crashes the app on the first render (see
 * `full-width.android.ts`, which asks Compose for the width instead).
 */
export function fullWidth(style: UniversalStyle = {}): FullWidthProps {
  return { style: { ...style, width: "100%" } };
}
