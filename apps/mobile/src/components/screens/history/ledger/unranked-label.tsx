import { StyleSheet, Text } from "react-native";
import { colors, fontSize, fonts } from "@/constants/theme";

export function UnrankedLabel() {
  return <Text style={styles.label}>UNRANKED</Text>;
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.sansBold, fontSize: fontSize.micro, letterSpacing: 0.9, color: colors.onTile },
});
