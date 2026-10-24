import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Image } from "expo-image";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import type { Tile as TileData } from "@wordpoker/contracts";

import { Tile, type TileSize } from "@/components/game";
import { FREE_PLAY, TurnClockProvider, formatClockMs } from "@/components/hud";
import { DEVICE_CLOCK_SAMPLE, useHandTurn } from "@/components/screens/game/turn";
import { BalanceChip } from "@/components/hud/top-bar/balance-chip";
import { TableBackdrop } from "@/components/screens/game/backdrop";
import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import { PlayerSeat } from "@/components/screens/game/primitives";
import { Pot } from "@/components/screens/game/primitives/pot";
import { WagerButton } from "@/components/screens/game/betting/wager-button";
import { BettingControls, RaiseSlider, useRaiseAmount } from "@/components/screens/game/betting";
import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, spacing } from "@/constants/theme";
import { useDictionary } from "@/features/table/use-dictionary";

import { Stage } from "./dev-word-demo";

/**
 * Development gallery for the code-drawn tabletop kit (STO-538): the letter tile in every state
 * and size, the seat's plate, badge and rack (STO-532), the real word builder in its tray, and
 * the table's buttons, on the supplied tabletop artwork — to hold against
 * `ui/v2/tabletop-reference-*.png` at 390 × 844 and 1440 × 900. Renders nothing in a release
 * build.
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
  return (
    <TurnClockProvider sample={DEVICE_CLOCK_SAMPLE}>
      <DevTabletopKitContent />
    </TurnClockProvider>
  );
}

function DevTabletopKitContent() {
  const timer = useHandTurn(FOUR_PLAYER_FLOP_FIXTURE, false);
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
      <TableBackdrop />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.artwork}>
          <View accessibilityLabel={`Flop, ${Math.ceil(timer.remainingMs / 1000)} seconds remaining`} style={styles.phase}>
            <Image source={require("../../assets/images/ui/v2/phase-frame-left-2-tight.png")} style={styles.phaseCapLeft} />
            <Image contentFit="fill" source={require("../../assets/images/ui/v2/phase-frame-middle-2-tight.png")} style={styles.phaseMiddle} />
            <Image source={require("../../assets/images/ui/v2/phase-frame-right-2-tight.png")} style={styles.phaseCapRight} />
            <Text style={styles.phaseLabel}>FLOP | {formatClockMs(timer.remainingMs)}</Text>
          </View>
        </View>
        <View style={styles.toggles}>
          <Toggle label="Flip backs" on={flipped} onPress={() => setFlipped((on) => !on)} />
          <Toggle label="Lift J" on={lifted} onPress={() => setLifted((on) => !on)} />
        </View>

        {/* The header's chip in every state it can hold (STO-562): four readouts and the one
            control — a signed-out chip with nowhere to go draws nothing at all. */}
        <Section title="balance chip">
          <View style={styles.chips}>
            <BalanceChip balance={{ state: "ready", amount: 1240 }} />
            <BalanceChip balance={{ state: "loading" }} />
            <BalanceChip balance={{ state: "unavailable" }} />
            <BalanceChip balance={FREE_PLAY} />
            <BalanceChip balance={{ state: "signed-out" }} onPress={() => {}} />
          </View>
        </Section>

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
                    level={10}
                    turnProgress={timer.elapsedFraction}
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
              <Pot key={amount} amount={amount} blinds={{ smallBlind: 10, bigBlind: 20 }} tabletop />
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
          <BettingPreview />
          <View style={styles.buttons}>
            <WagerButton amount="300" label="RAISE" size={180} testID="preview-raise" />
            <WagerButton amount="1.2K" label="BET" size={108} testID="preview-bet" />
            <WagerButton amount="300" label="RAISE" disabled size={88} />
            <WagerButton
              label="CHECK"
              size={88}
              testID="preview-waiting"
              waitingOn={{
                name: "Aria",
                view: { remainingMs: 8_000, totalMs: 20_000, elapsedMs: 12_000, elapsedFraction: 0.6, urgency: "warn", expired: false, paused: false },
              }}
            />
          </View>
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

function BettingPreview() {
  const [facingBet, setFacingBet] = useState(false);
  const state = {
    ...FOUR_PLAYER_FLOP_FIXTURE.betting,
    canCheck: !facingBet,
    canBet: !facingBet,
    canRaise: facingBet,
    primary: facingBet ? "call" as const : "check" as const,
    wager: facingBet ? "raise" as const : "bet" as const,
    callAmount: facingBet ? 20 : undefined,
    currentBet: facingBet ? 20 : 0,
    minRaise: facingBet ? 40 : 20,
  };
  const [amount, changeAmount] = useRaiseAmount(state);
  const [open, setOpen] = useState(false);
  return <View style={{ width: "100%", maxWidth: 400 }}>
    <Toggle label="Facing a bet" on={facingBet} onPress={() => setFacingBet((value) => !value)} />
    <View style={{ alignItems: "flex-end" }}>
      <RaiseSlider amount={amount} onAmountChange={changeAmount} open={open} pot={120} state={state} />
    </View>
    <BettingControls state={state} amount={amount} locked={false} raiseOpen={open} onRaiseOpenChange={setOpen} />
  </View>;
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
  artwork: { alignItems: "center", gap: spacing.md },
  phase: { flexDirection: "row", height: 64, width: 250, alignItems: "center", justifyContent: "center" },
  phaseCapLeft: { height: 64, width: 77 },
  phaseCapRight: { height: 64, width: 92 },
  phaseMiddle: { height: 64, flex: 1 },
  phaseLabel: { position: "absolute", color: "#ffe5a0", fontFamily: fonts.arcade, fontSize: 22 },
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
  chips: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
