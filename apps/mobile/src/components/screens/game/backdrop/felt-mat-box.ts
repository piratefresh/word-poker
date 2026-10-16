/**
 * The felt mat's place on the screen, in screen points. It lies on the wood in the middle band
 * of the screen, nearly as wide as the screen, turned a little counter-clockwise so it reads as
 * put down by hand. The canvas draws it from this box and the felt lays the table out on it.
 */
export const MAT = {
  /** Wood left showing on each side, in points. */
  side: 12,
  /** The mat's band, as shares of the screen's height. */
  top: 0.24,
  bottom: 0.69,
  radius: 26,
  /** Counter-clockwise, in degrees. */
  tilt: -1.5,
  /** How far inside the edge the stitched line runs, in points. */
  stitch: 9,
} as const;

export interface MatBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * `top`, when given, is where the mat starts in points — under the HUD, so it reaches the seats;
 * `bottom` is where it ends — under the word builder, so the hand's card slots lie on it.
 */
export function matBox(
  screen: { width: number; height: number },
  top?: number,
  bottom?: number,
): MatBox {
  const y = Math.round(top ?? screen.height * MAT.top);
  return {
    x: MAT.side,
    y,
    width: screen.width - MAT.side * 2,
    height: Math.round(bottom ?? screen.height * MAT.bottom) - y,
  };
}
