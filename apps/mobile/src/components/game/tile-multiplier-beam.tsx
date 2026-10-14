import type { LetterMultiplier } from "@wordpoker/contracts";
import type { ReactNode } from "react";

import { BorderBeam } from "@/components/ui/border-beam";
import { palette } from "@/constants/theme";

const DOUBLE_BORDER = palette.violet400;
const TRIPLE_BORDER = ["#ff4d4d", "#ffb020", "#ffe94d", "#3ddc84", "#3da9ff", "#a455ff"];
const DOUBLE_BEAM = [DOUBLE_BORDER, "#e3d2ff", DOUBLE_BORDER];

/**
 * The same border beam the choice tile's strip and the seats use, round the whole tile: violet on
 * a 2x tile, the rainbow on a 3x. A tile with no multiplier, or one that is face down or under
 * Reduce Motion, is drawn as it is; the static border says the same thing without the light.
 */
export function MultiplierBeam({
  multiplier,
  active,
  radius,
  borderWidth,
  children,
}: {
  multiplier: LetterMultiplier | undefined;
  active: boolean;
  radius: number;
  borderWidth: number;
  children: ReactNode;
}) {
  if (multiplier === undefined || !active) return <>{children}</>;
  return (
    <BorderBeam
      ambient={0.3}
      beamLength={0.5}
      borderRadius={radius}
      borderWidth={borderWidth + 1}
      colors={multiplier === "triple-letter" ? TRIPLE_BORDER : DOUBLE_BEAM}
      duration={2.4}
      glow={3}
      style={{ width: "100%" }}
    >
      {children}
    </BorderBeam>
  );
}
