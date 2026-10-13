import { Image } from "expo-image";
import Svg, { G, Rect, Text as SvgText } from "react-native-svg";

import { fonts, palette } from "@/constants/theme";

// Relative, as the felt's other art is: Jest maps `@/` to `src/` only.
const ART: Readonly<Record<string, number>> = {
  "random-wild": require("../../../assets/images/ui/card/power-random-wild.webp"),
  "vowel-magnet": require("../../../assets/images/ui/card/power-vowel-magnet.webp"),
};

/**
 * A power's art, drawn from the catalog's `icon` key: contracts carry a key rather than an asset,
 * so the app is the one place a key becomes a picture. The art is square-ish and transparent,
 * and is fitted inside a `size` square.
 *
 * A key the app has no art for draws a bare tile, so a catalog entry that lands before its art
 * still has a card to show.
 */
export function PowerEmblem({ icon, size }: { icon: string; size: number }) {
  const art = ART[icon];
  if (art !== undefined) {
    return <Image contentFit="contain" source={art} style={{ height: size, width: size }} />;
  }

  return (
    <Svg height={size} viewBox="0 0 64 64" width={size}>
      <TileFace letter="?" />
    </Svg>
  );
}

/** The fallback: a cream tile face with the letter in the felt's own green. */
function TileFace({ letter }: { letter: string }) {
  const [x, y, size] = [18, 16, 28];
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
