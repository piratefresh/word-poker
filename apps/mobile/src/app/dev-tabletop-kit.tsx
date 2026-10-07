import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { Tile as TileData } from "@wordpoker/contracts";

import { Tile, type TileSize } from "@/components/game";
import { SceneBackdrop } from "@/components/screens/game/backdrop/scene-backdrop";
import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import { PlayerSeat } from "@/components/screens/game/primitives";
import { Pot } from "@/components/screens/game/primitives/pot";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, spacing } from "@/constants/theme";
import { useDictionary } from "@/features/table/use-dictionary";

import { Stage } from "./dev-word-demo";

/**
 * Development gallery for the code-drawn tabletop kit (STO-538): the letter tile in every state
 * and size, the real word builder in its tray, and the table's buttons, on the tiled wood that
 * stands in for the backdrop art — to hold against `ui/v2/tabletop-reference-*.png` at 390 × 844
 * and 1440 × 900. Renders nothing in a release build.
 */
const J: TileData = { id: "J-1", letter: "J", points: 8 };
const A: TileData = { id: "A-1", letter: "A", points: 1 };
const T: TileData = { id: "T-1", letter: "T", points: 1 };
const CHOICE: TileData = {
  id: "AE-1",
  letter: "A",
  points: 1,
  alternativeLetter: "E",
  alternativePoints: 1,
};
const DOUBLE: TileData = { id: "D-1", letter: "D", points: 2, multiplier: "double-letter" };
const TRIPLE: TileData = { id: "R-1", letter: "R", points: 1, multiplier: "triple-letter" };
const POWERED: TileData = { id: "power-0", letter: "Q", points: 10 };

/** Nothing to subscribe to: the store only tells the server's render from the client's. */
const subscribeNever = () => () => {};

const SIZES: readonly TileSize[] = ["small", "medium", "large"];
const SCALES = [1, 1.5] as const;

export default function DevTabletopKit() {
  const dictionary = useDictionary();
  const [flipped, setFlipped] = useState(false);
  const [lifted, setLifted] = useState(false);
  const [river, setRiver] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  // The backdrop and the choice tile's beam load CanvasKit on the web, which a server render of
  // this route cannot, so the gallery draws on the client only.
  const onClient = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!__DEV__ || !onClient) return null;

  return (
    <View style={styles.page} testID="tabletop-kit">
      <SceneBackdrop look="tabletop" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.toggles}>
          <Toggle label="Flip backs" on={flipped} onPress={() => setFlipped((on) => !on)} />
          <Toggle label="Lift J" on={lifted} onPress={() => setLifted((on) => !on)} />
        </View>

        {/* The real tabletop seat on the tests' fixture (STO-532): plate, rack and badge. */}
        <Section title="player seat (tabletop · 400 room)">
          <View style={styles.seats}>
            {["ellis", "jay", "magnus"].map((id, index) => (
              <View key={id} style={styles.seatWrap}>
                <View style={styles.seatAnchor}>
                  <PlayerSeat
                    anchor={{ x: 0, y: 0, angle: Math.PI / 2, key: id, index }}
                    appearanceWidth={400}
                    dealt
                    isDealer={index === 0}
                    scale={1}
                    seat={FOUR_PLAYER_FLOP_FIXTURE.players.find((p) => p?.id === id) ?? null}
                    seatCount={4}
                    size={{ width: 400, height: 400 }}
                    tabletop
                  />
                </View>
              </View>
            ))}
          </View>
        </Section>

        <Section title="dynamic pot chips">
          <View style={styles.tiles}>
            {[0, 20, 120, 137, 1000, 12000].map((amount) => (
              <Pot key={amount} amount={amount} tabletop />
            ))}
          </View>
        </Section>

        {SCALES.flatMap((scale) =>
          SIZES.map((size) => (
            <Section key={`${size}-${scale}`} title={`${size} · scale ${scale}`}>
              <View style={styles.tiles}>
                <Tile scale={scale} selected={lifted} side="front" size={size} tile={J} />
                <Tile scale={scale} side="front" size={size} tile={A} />
                <Tile scale={scale} side="front" size={size} tile={T} />
                <Tile scale={scale} side="front" size={size} tile={CHOICE} />
                <Tile scale={scale} side="front" size={size} tile={DOUBLE} />
                <Tile scale={scale} side="front" size={size} tile={TRIPLE} />
                <Tile powered scale={scale} side="front" size={size} tile={POWERED} />
                <Tile scale={scale} selected side="front" size={size} tile={A} />
                <Tile dimmed scale={scale} side="front" size={size} tile={T} />
                <Tile scale={scale} side={flipped ? "front" : "back"} size={size} tile={J} />
                <Tile scale={scale} side={flipped ? "front" : "back"} size={size} tile={A} />
              </View>
            </Section>
          )),
        )}

        <Section title="word builder">
          <View style={styles.toggles}>
            <Toggle label="Flop · 5 + 2 empty" on={!river} onPress={() => setRiver(false)} />
            <Toggle label="River · 7" on={river} onPress={() => setRiver(true)} />
          </View>
          {/* The felt's rack slot runs the screen's full width, so the builder is as wide as the
              window, to a phone-and-a-bit on a desktop. */}
          <View style={[styles.builder, { width: Math.min(windowWidth, 480) }]}>
            {dictionary === null ? null : (
              <Stage
                actions
                dictionary={dictionary}
                flush
                key={river ? "river" : "flop"}
                revealed={river ? 5 : 3}
              />
            )}
          </View>
        </Section>

        <Section title="buttons">
          <View style={styles.buttons}>
            <GameButton label="FOLD" scale={1.2} style={styles.flex} variant="danger" />
            <GameButton scale={1.2} style={styles.flex} variant="blue">
              <Text style={styles.callLabel}>CALL</Text>
              <Coin />
              <Text style={styles.callLabel}>20</Text>
            </GameButton>
            <GameButton label="RAISE" scale={1.2} style={styles.flex} variant="gold" />
          </View>
          <View style={styles.buttons}>
            <GameButton disabled label="FOLD" scale={1.2} style={styles.flex} variant="danger" />
            <GameButton disabled label="CALL 20" scale={1.2} style={styles.flex} variant="blue" />
            <GameButton disabled label="RAISE" scale={1.2} style={styles.flex} variant="gold" />
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{title}</Text>
      {children}
    </View>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.toggle, on && styles.toggleOn]}
    >
      <Text style={styles.toggleText}>{label}</Text>
    </Pressable>
  );
}

/** A stand-in for the coin glyph: the reference's Call button wears one beside its amount. */
function Coin() {
  return <View style={styles.coin} />;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.bg, flex: 1 },
  content: { alignItems: "stretch", gap: spacing.xl, padding: spacing.lg },
  section: { gap: spacing.sm },
  label: {
    color: colors.textBright,
    fontFamily: fonts.mono,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { height: 1, width: 0 },
    textShadowRadius: 2,
  },
  toggles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  seats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, justifyContent: "center" },
  seatWrap: { height: 200, width: 124 },
  // A seat hangs from its avatar's centre: the anchor is the column's middle, half an avatar down.
  seatAnchor: { left: 62, position: "absolute", top: 40 },
  toggle: {
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  toggleOn: { backgroundColor: "rgba(210,150,30,0.9)" },
  toggleText: { color: colors.textBright, fontFamily: fonts.mono },
  tiles: { alignItems: "flex-end", flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  builder: { alignSelf: "center" },
  buttons: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1 },
  callLabel: { color: "#ffffff", fontFamily: fonts.arcade, fontSize: 14 },
  coin: {
    backgroundColor: "#fec53a",
    borderColor: "#b45f06",
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
  },
});
