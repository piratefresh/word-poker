/**
 * back-room.tsx — the VIP club's backdrop, behind the green door (STO-1170). Mirrors the design's
 * "Back room": panelled walls, a wainscot with its rail, and a hanging lamp's oval glow. Stands in
 * for the painted art until it lands.
 */

import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

const WALL_PANEL = 62;
const WAINSCOT_SEAM = 94;
const MAX_WIDTH = 1400;

/** Evenly spaced seams across the width: a dark groove with a faint lit edge beside it. */
function Seams({ every, dark, light }: { every: number; dark: string; light?: string }) {
  return (
    <View style={styles.seams}>
      {Array.from({ length: Math.ceil(MAX_WIDTH / every) }, (_, i) => (
        <View key={i} style={[styles.seamCell, { width: every }]}>
          <View style={[styles.seam, { backgroundColor: dark }]} />
          {light ? <View style={[styles.seamLight, { backgroundColor: light }]} /> : null}
        </View>
      ))}
    </View>
  );
}

export function BackRoom() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="vip-back-room">
      <LinearGradient colors={["#4a2219", "#341510", "#24100b"]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Seams dark="rgba(0,0,0,0.22)" every={WALL_PANEL} light="rgba(255,220,170,0.04)" />

      <View style={styles.wainscot}>
        <LinearGradient colors={["#7a4220", "#4a2410"]} style={StyleSheet.absoluteFill} />
        <Seams dark="rgba(0,0,0,0.25)" every={WAINSCOT_SEAM} />
        <View style={styles.rail} />
        <View style={styles.railShadow} />
      </View>

      <Svg height="100%" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <RadialGradient cx="50%" cy="6%" id="lamp" rx="70%" ry="42%">
            <Stop offset="0" stopColor="#ffd68c" stopOpacity={0.42} />
            <Stop offset="0.55" stopColor="#ffbe6e" stopOpacity={0.12} />
            <Stop offset="0.75" stopColor="#ffbe6e" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#lamp)" height="100%" width="100%" />
      </Svg>

      <LinearGradient
        colors={["transparent", "rgba(10,6,4,0.35)", "rgba(10,6,4,0.6)"]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  seams: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, flexDirection: "row", overflow: "hidden" },
  seamCell: { flexDirection: "row", height: "100%" },
  seam: { height: "100%", width: 2 },
  seamLight: { height: "100%", width: 2 },
  wainscot: { bottom: 0, height: "26%", left: 0, overflow: "hidden", position: "absolute", right: 0 },
  rail: { backgroundColor: "#b87442", height: 3, left: 0, position: "absolute", right: 0, top: 0 },
  railShadow: { backgroundColor: "#3a1c0c", height: 3, left: 0, position: "absolute", right: 0, top: 3 },
});
