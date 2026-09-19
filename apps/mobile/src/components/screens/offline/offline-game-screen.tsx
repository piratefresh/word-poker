import { Button, Host } from "@expo/ui";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GameScreen } from "@/components/screens/game/game-screen";
import { colors, palette, spacing } from "@/constants/theme";
import { useOfflineGame } from "@/lib/use-offline-game";

/**
 * The offline table: a whole hand played on the device with the server stopped.
 *
 * The screen is a shell around `GameScreen` — the felt, the seats, the HUD, the tiles,
 * and the countdown are the shipped hand rather than a copy of it — plus the one control
 * this slice adds: the tap that walks the round, and the one that starts the next hand
 * once the last has paid out.
 *
 * Betting is out of scope (STO-280), so the mapped state disables all three betting
 * controls and the handlers below are inert. They are wired rather than omitted because
 * the felt keeps its final shape: the controls are the ones the betting slice will arm,
 * and a screen that renders them differently here would be previewing a table that does
 * not exist.
 */
export function OfflineGameScreen() {
  const insets = useSafeAreaInsets();
  const { game, deal, advance } = useOfflineGame();
  const payout = game.phase === "payout";

  return (
    <View style={styles.screen}>
      <View style={styles.table}>
        <GameScreen
          game={game}
          onCheckOrCall={noBetting}
          onFold={noBetting}
          onRaise={noBetting}
        />
      </View>
      {/*
        The round's own control gets a band under the felt rather than a layer over it:
        every floating position on the felt lands on a seat, the rack, or the board, and
        the betting row that would otherwise share this space is disabled offline.
      */}
      <View style={[styles.controls, { paddingBottom: insets.bottom + spacing.sm }]}>
        <Host colorScheme="dark" matchContents seedColor={colors.gold} style={styles.host}>
          <Button
            label={payout ? "Deal" : "Advance"}
            onPress={payout ? deal : advance}
            variant="filled"
          />
        </Host>
      </View>
    </View>
  );
}

/** Offline has no betting: the mapped state disables the controls that would call this. */
function noBetting() {}

const styles = StyleSheet.create({
  // The felt's gradient lands on `felt800`, so the band under it paints that same colour
  // and the two surfaces read as one table.
  screen: { backgroundColor: palette.felt800, flex: 1 },
  table: { flex: 1 },
  controls: { alignItems: "center", paddingTop: spacing.sm * 2 },
  // `@expo/ui`'s host hugs its parent's start edge by default, so the pill asks for the
  // centre itself rather than relying on the row's alignment.
  host: { alignSelf: "center" },
});
