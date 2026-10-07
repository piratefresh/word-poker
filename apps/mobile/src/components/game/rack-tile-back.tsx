import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

import { ShadowBox } from "@/components/ui/shadow-box";
import { tileMaterial } from "@/constants/theme";

/**
 * The opponent rack's face-down tile (STO-532): the canonical back's material — the
 * crimson face, inset line and diamond from `tileMaterial` — drawn standing in the rack,
 * with a thin ivory thickness at its sides and no tabletop slab or floor shadow. `Tile
 * side="back"` lies flat on the felt with its slab and contact shadow; here the tile
 * leans into the wood, and its feet are meant to hide behind the rack's lip. Drawn at a
 * 64-point base and re-sized by `width`, for seats that scale with their table.
 */
export function RackTileBack({ width = 64, height = (width * 58) / 64 }: { width?: number; height?: number }) {
  const s = width / 64;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.tile, rackTileSize(s, height)]}
    >
      <ShadowBox radius={Math.max(2, 5 * s)} shadows={[{ dx: 3, dy: 9, blur: 14, color: "rgba(30,14,0,0.85)" }]} />
      <LinearGradient colors={tileMaterial.back.gradient} style={[styles.face, rackFaceSize(s)]}>
        <View style={[styles.diamond, { height: 19 * s, width: 19 * s }]} />
      </LinearGradient>
    </View>
  );
}

/** The tile's box and its ivory side thickness, at `s` of the 64-point base. */
function rackTileSize(s: number, height: number) {
  return {
    width: Math.round(64 * s),
    height: Math.round(height),
    borderRadius: Math.max(2, 5 * s),
    borderTopWidth: Math.max(1, 2 * s),
    borderLeftWidth: Math.max(1, 3 * s),
    borderRightWidth: Math.max(1, 3 * s),
    paddingTop: Math.max(1, s),
  };
}

function rackFaceSize(s: number) {
  return {
    borderRadius: Math.max(1, 3 * s),
    borderWidth: Math.max(1, s),
  };
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: "#f6e7c8",
    borderTopColor: "#fff8e5",
    borderLeftColor: "#fff3d8",
    borderRightColor: "#ae8050",
  },
  face: {
    alignItems: "center",
    borderColor: tileMaterial.back.inset,
    flex: 1,
    justifyContent: "center",
  },
  diamond: { backgroundColor: tileMaterial.back.diamond, transform: [{ rotate: "45deg" }] },
});
