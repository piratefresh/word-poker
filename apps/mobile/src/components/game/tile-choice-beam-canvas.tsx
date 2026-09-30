import { useMemo } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { BorderBeam } from "@/components/ui/border-beam";

export interface TileChoiceBeamProps {
  active: boolean;
  color: string;
  height: number;
}

/** The beam follows only the top strip; its parent clips the glow to that accent. */
export function TileChoiceBeamCanvas({ active, color, height }: TileChoiceBeamProps) {
  const reduceMotion = useReducedMotion();
  const colors = useMemo(() => [color, color], [color]);
  if (!active || reduceMotion) {
    return <View style={{ backgroundColor: color, height }} />;
  }
  return (
    <BorderBeam
      ambient={0.2}
      beamLength={0.45}
      borderRadius={height / 2}
      borderWidth={height / 2}
      colors={colors}
      duration={2.4}
      glow={2}
    >
      <View style={{ backgroundColor: color, height, opacity: 0.35 }} />
    </BorderBeam>
  );
}
