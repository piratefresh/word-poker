import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";

import { fonts, palette } from "@/constants/theme";

/**
 * A power's art, drawn from the catalog's `icon` key: contracts carry a key rather than an asset,
 * so the app is the one place a key becomes a picture. Every v1 power is a swap of a private tile,
 * so each emblem is the tile it gives, marked with where the new letter comes from.
 *
 * A key the app has no art for draws the bare tile, so a catalog entry that lands before its art
 * still has a card to show.
 */
export function PowerEmblem({ icon, size }: { icon: string; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      {icon === "random-wild" ? <RandomWild /> : null}
      {icon === "vowel-magnet" ? <VowelMagnet /> : null}
      {icon === "mulligan" ? <Mulligan /> : null}
      {!KNOWN.has(icon) ? <TileFace letter="?" /> : null}
    </Svg>
  );
}

const KNOWN = new Set(["random-wild", "vowel-magnet", "mulligan"]);

/** The tile a swap hands over: a cream face with the letter in the felt's own green. */
function TileFace({ letter, x = 18, y = 16, size = 28 }: { letter: string; x?: number; y?: number; size?: number }) {
  return (
    <G>
      <Rect fill={palette.gold500} height={size} rx={5} width={size} x={x} y={y + 2} />
      <Rect fill={palette.cream100} height={size} rx={5} stroke={palette.gold300} strokeWidth={1.5} width={size} x={x} y={y} />
      <SvgText
        fill={palette.felt500}
        fontFamily={fonts.arcade}
        fontSize={size * 0.68}
        fontWeight="bold"
        textAnchor="middle"
        x={x + size / 2}
        y={y + size * 0.74}
      >
        {letter}
      </SvgText>
    </G>
  );
}

/** Four-pointed sparkle, centred on (cx, cy). */
function Sparkle({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const w = r * 0.28;
  return (
    <Path
      d={`M${cx} ${cy - r} L${cx + w} ${cy - w} L${cx + r} ${cy} L${cx + w} ${cy + w} L${cx} ${cy + r} L${cx - w} ${cy + w} L${cx - r} ${cy} L${cx - w} ${cy - w} Z`}
      fill={palette.gold100}
    />
  );
}

/** Any letter at all: the tile's face is a question, and the sparkles say it is a wild one. */
function RandomWild() {
  return (
    <G>
      <TileFace letter="?" />
      <Sparkle cx={50} cy={14} r={7} />
      <Sparkle cx={13} cy={48} r={5} />
      <Sparkle cx={52} cy={46} r={4} />
    </G>
  );
}

/** A vowel pulled in: a horseshoe magnet over the tile it draws. */
function VowelMagnet() {
  return (
    <G>
      <TileFace letter="A" x={20} y={30} size={24} />
      <Path
        d="M18 26 V16 a14 14 0 0 1 28 0 V26"
        fill="none"
        stroke={palette.red500}
        strokeLinecap="butt"
        strokeWidth={8}
      />
      <Rect fill={palette.cream200} height={5} width={8} x={14} y={22} />
      <Rect fill={palette.cream200} height={5} width={8} x={42} y={22} />
    </G>
  );
}

/** The next tile of the bag: the tile turned over by a round arrow. */
function Mulligan() {
  return (
    <G>
      <Circle cx={32} cy={32} fill="none" r={25} stroke={palette.gold300} strokeDasharray="118 40" strokeWidth={4} />
      <Path d="M52 12 L58 24 L45 22 Z" fill={palette.gold300} />
      <TileFace letter="N" x={20} y={19} size={24} />
    </G>
  );
}
