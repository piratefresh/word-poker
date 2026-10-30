import { Platform, View, type ViewStyle } from "react-native";

import { nightLobby } from "@/constants/theme";

/**
 * The flat chip beside an amount (design 1a): gold for coins and online chips, silver for practice
 * chips, so a bot table's stacks never read as the Wallet. Decorative; the amount speaks for it.
 */
export function CoinChip({ size, practice = false }: { size: number; practice?: boolean }) {
  const [light, dark] = practice ? nightLobby.practiceChip.gradient : nightLobby.coin.gradient;
  return (
    <View
      accessible={false}
      pointerEvents="none"
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark }, radial(light, dark)]}
    />
  );
}

/** Native takes a CSS gradient as `experimental_backgroundImage`; react-native-web as `backgroundImage`. */
function radial(light: string, dark: string): ViewStyle {
  const image = `radial-gradient(circle at 35% 35%, ${light}, ${dark})`;
  return (Platform.OS === "web" ? { backgroundImage: image } : { experimental_backgroundImage: image }) as ViewStyle;
}
