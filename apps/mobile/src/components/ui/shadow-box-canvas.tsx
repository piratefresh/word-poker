/**
 * shadow-box-canvas.tsx — soft shadows for a rounded surface, drawn by Skia.
 *
 * Put one inside the surface as its first child for drop shadows (they are clipped out of the box,
 * so they never tint the surface itself), or as its last child for `inner` ones. It fills the
 * surface and bleeds past it by the room the drop shadows need, so the parent needs no overflow.
 * Specs are CSS-shaped (`blur` is a CSS blur radius). On the web CanvasKit must be loaded before
 * this file is imported, so use `ShadowBox` from `shadow-box`, never this file directly.
 */

import { Canvas, Group, RoundedRect, Shadow, rect, rrect } from "@shopify/react-native-skia";
import { useState } from "react";

export interface ShadowSpec {
  dx?: number;
  dy: number;
  blur: number;
  color: string;
  /** Painted inside the box rather than around it. */
  inner?: boolean;
}

export interface ShadowBoxProps {
  radius: number;
  shadows: readonly ShadowSpec[];
}

/** Room a drop shadow takes past the box: its blur's reach, and its offset. */
export function shadowBleed(shadows: readonly ShadowSpec[]): number {
  return Math.ceil(
    Math.max(
      0,
      ...shadows.filter((s) => !s.inner).map((s) => s.blur * 1.5 + Math.max(Math.abs(s.dx ?? 0), Math.abs(s.dy))),
    ),
  );
}

export function ShadowBoxCanvas({ radius, shadows }: ShadowBoxProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const pad = shadowBleed(shadows);
  const width = size.width - pad * 2;
  const height = size.height - pad * 2;
  const box = { x: pad, y: pad, width, height, r: radius };

  return (
    <Canvas
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      pointerEvents="none"
      style={{ position: "absolute", bottom: -pad, left: -pad, right: -pad, top: -pad }}
    >
      {width <= 0 || height <= 0
        ? null
        : shadows.map((s, i) => (
            <Group
              clip={rrect(rect(pad, pad, width, height), radius, radius)}
              invertClip={!s.inner}
              key={i}
            >
              <RoundedRect {...box} color="black">
                <Shadow blur={s.blur / 2} color={s.color} dx={s.dx ?? 0} dy={s.dy} inner={s.inner} shadowOnly />
              </RoundedRect>
            </Group>
          ))}
    </Canvas>
  );
}

