import type { ReactNode } from "react";
import { useReducedMotion } from "react-native-reanimated";

import { BorderBeam } from "@/components/ui/border-beam";
import { colors } from "@/constants/theme";

export interface SeatBeamProps {
  /** Whether the seat's turn is running: only then does the beam circle the avatar. */
  active: boolean;
  /** The avatar's diameter: the beam follows its round edge. */
  size: number;
  /** The avatar's border and the beam's glow, scaled with the seat. */
  borderWidth: number;
  glow: number;
  children: ReactNode;
}

/** Gold light, so the beam reads as the table's own trim rather than a new colour. */
const BEAM_COLORS = [colors.goldHi, colors.gold, "#fff3c4", colors.goldDeep, colors.gold];

/**
 * A light that runs around a seat's avatar while its turn is on — the hero's and every other
 * seat's alike — so the eye finds whose move it is before reading a label. Reduce Motion keeps
 * the avatar as it is: the seat's lit border and status pill still say whose turn it is.
 */
export function SeatBeamCanvas({ active, size, borderWidth, glow, children }: SeatBeamProps) {
  const reduceMotion = useReducedMotion();
  if (!active || reduceMotion) return <>{children}</>;
  return (
    <BorderBeam
      ambient={0.2}
      beamLength={0.45}
      borderRadius={size / 2}
      borderWidth={borderWidth}
      colors={BEAM_COLORS}
      duration={2.4}
      glow={glow}
    >
      {children}
    </BorderBeam>
  );
}
