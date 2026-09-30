import { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TableBackdrop } from "@/components/screens/game/table-backdrop";
import { TABLE_ASPECT, TABLE_REACH, TableImage } from "@/components/table";
import { colors, fonts, palette, spacing } from "@/constants/theme";

/**
 * Development preview for the painted table: the one the game rooms sit around, over the ember
 * backdrop, as large as the screen allows — resize the window (or turn the device) to see it
 * scale. Renders nothing in a release build.
 */

/** Room kept clear around the painting. */
const MARGIN = spacing.xl;

type Size = { width: number; height: number };

/** The widest table top whose whole painting fits `box` with a margin, centred. */
function fitTable(box: Size) {
  const freeW = box.width - MARGIN * 2;
  const freeH = box.height - MARGIN * 2;
  if (freeW <= 0 || freeH <= 0) return null;
  // Per point of table-top height, the painting is this wide and this tall.
  const perW = TABLE_ASPECT + 2 * TABLE_REACH.side;
  const perH = 1 + TABLE_REACH.top + TABLE_REACH.bottom;
  const height = Math.min(freeW / perW, freeH / perH);
  return {
    width: height * TABLE_ASPECT,
    left: (box.width - height * TABLE_ASPECT) / 2,
    top: (box.height - height * perH) / 2 + TABLE_REACH.top * height,
    height,
  };
}

export default function DevTable() {
  const [box, setBox] = useState<Size>({ width: 0, height: 0 });
  const insets = useSafeAreaInsets();
  if (!__DEV__) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const table = fitTable(box);

  return (
    <View onLayout={onLayout} style={styles.page}>
      <TableBackdrop look="ember" />
      {table ? (
        <>
          <TableImage
            style={[styles.table, { left: table.left, top: table.top }]}
            width={table.width}
          />
          <Text pointerEvents="none" style={[styles.size, { top: insets.top + spacing.md }]}>
            {`${Math.round(table.width)} × ${Math.round(table.height)}`}
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.felt800, overflow: "hidden" },
  table: { position: "absolute" },
  size: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    left: spacing.lg,
    position: "absolute",
  },
});
