/**
 * join-action.tsx — design 1a's price-tag Join: the button says what sitting down costs, the line
 * under it says what happens to the coins, and a short Wallet gets its two ways back. The hero card
 * and the details sheet both draw it, so the two can never quote a table differently.
 */

import { router } from "expo-router";
import { type ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import { type RoomSummary } from "@wordpoker/contracts";

import { fonts, fontSize, nightLobby, radius, spacing } from "@/constants/theme";
import { NightLobbyButton } from "./night-lobby-button";
import { joinNote, joinOffer, type JoinContext } from "./parlor-view";

/** Room left under the button for the buy-in slider (STO-471). */
const SLIDER_SPACE = 12;

export interface JoinActionProps {
  readonly room: RoomSummary;
  readonly context: JoinContext;
  readonly surface: "card" | "sheet";
  /** The table a full one points to; see `tableThatFits`. */
  readonly elsewhere?: RoomSummary | null;
  readonly onJoin: () => void;
  readonly testID: string;
}

export function JoinAction({ room, context, surface, elsewhere = null, onJoin, testID }: JoinActionProps): ReactElement {
  const offer = joinOffer(room, context);
  const note = joinNote(room, context, surface, elsewhere);

  return (
    <View style={styles.action}>
      {offer.kind === "yours" ? <Text style={styles.eyebrow}>YOU&apos;RE SEATED</Text> : null}
      <NightLobbyButton
        accessibilityLabel={offer.spoken}
        busy={offer.kind === "joining"}
        disabled={!offer.enabled}
        label={offer.label}
        onPress={onJoin}
        testID={testID}
        tone={offer.kind === "yours" ? "cream" : "gold"}
      >
        {offer.price === null ? null : (
          <>
            <View style={styles.coin} />
            <Text style={styles.price}>{offer.price}</Text>
          </>
        )}
      </NightLobbyButton>
      {note === null ? null : <Text style={styles.note} testID={`${testID}-note`}>{note}</Text>}
      {offer.kind === "short" ? (
        <View style={styles.ways}>
          <View style={styles.way}>
            <NightLobbyButton label="STORE" onPress={() => router.push("/store")} testID={`${testID}-store`} tone="outline" />
          </View>
          <View style={styles.way}>
            <NightLobbyButton label="QUESTS" onPress={() => router.push("/quests")} testID={`${testID}-quests`} tone="outline" />
          </View>
        </View>
      ) : null}
      <View style={styles.sliderSpace} />
    </View>
  );
}

const styles = StyleSheet.create({
  action: { gap: spacing.sm },
  eyebrow: { color: nightLobby.status.seat, fontFamily: fonts.rubikSemiBold, fontSize: fontSize.caption, letterSpacing: 1.8, textAlign: "center" },
  coin: { backgroundColor: nightLobby.coin.gradient[0], borderColor: nightLobby.coin.gradient[1], borderRadius: radius.pill, borderWidth: 2, height: 18, width: 18 },
  price: { color: nightLobby.gold.buttonText, fontFamily: fonts.arcade, fontSize: 21, letterSpacing: 0.6 },
  note: { color: nightLobby.text.muted, fontFamily: fonts.rubik, fontSize: fontSize.small, textAlign: "center" },
  ways: { flexDirection: "row", gap: spacing.sm },
  way: { flex: 1 },
  sliderSpace: { height: SLIDER_SPACE },
});
