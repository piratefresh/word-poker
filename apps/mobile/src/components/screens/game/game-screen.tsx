import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PokerTable } from "@/components/table";
import {
  border,
  colors,
  elevation,
  fonts,
  gradients,
  layout,
  opacity,
  palette,
  radius,
} from "@/constants/theme";
import {
  ActionButton,
  BestWord,
  ChatGlyph,
  CommunityStrip,
  PlayerRack,
  PlayerSeat,
  Pot,
} from "./game-primitives";
import type { BettingState, GameScreenState } from "./game-types";

export interface GameScreenProps {
  game: GameScreenState;
  onBack?: () => void;
  onHelp?: () => void;
  onChat?: () => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  onRaise?: (amount: number) => void;
  onRaiseAmountChange?: (amount: number) => void;
}

export function GameScreen({
  game,
  onBack,
  onHelp,
  onChat,
  onFold,
  onCheckOrCall,
  onRaise,
  onRaiseAmountChange,
}: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compact = height - insets.top - insets.bottom < 690;
  const [raiseAmount, setRaiseAmount] = useState(game.betting.raiseAmount);

  const changeRaise = useCallback(
    (next: number) => {
      const { minRaise, maxRaise, raiseStep } = game.betting;
      const stepped = Math.round(next / raiseStep) * raiseStep;
      const value = Math.max(minRaise, Math.min(maxRaise, stepped));
      setRaiseAmount(value);
      onRaiseAmountChange?.(value);
    },
    [game.betting, onRaiseAmountChange],
  );

  const goBack = () => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <LinearGradient
      colors={["#0a1d17", "#051410"]}
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.content, { maxWidth: Math.min(520, width) }]}>
        <GameHeader
          phaseLabel={`PHASE ${game.phaseNumber} · ${game.phase.toUpperCase()}`}
          secondsRemaining={game.secondsRemaining}
          onBack={goBack}
          onHelp={onHelp}
          onChat={onChat}
        />
        <CommunityStrip tiles={game.community} />
        <View style={[styles.tableRegion, compact && styles.tableRegionCompact]}>
          <PokerTable
            chromeInset={compact ? 36 : 42}
            community={[]}
            layoutConfig={{ seatRadius: { x: 0.98, y: 0.96 }, potY: 0.5 }}
            railWidth={3}
            renderCommunity={() => null}
            renderPot={() => <Pot amount={game.pot} />}
            renderSeat={PlayerSeat}
            seatCount={game.seatCount}
            seats={game.players}
            style={styles.table}
            testID="poker-table"
          />
        </View>
        <BestWord
          payout={game.phase === "payout"}
          score={game.bestScore}
          word={game.bestWord}
        />
        <PlayerRack community={game.community} privateTiles={game.privateTiles} />
        <BettingControls
          amount={raiseAmount}
          onAmountChange={changeRaise}
          onCheckOrCall={onCheckOrCall}
          onFold={onFold}
          onRaise={() => onRaise?.(raiseAmount)}
          state={game.betting}
        />
      </View>
      <ChatButton bottom={insets.bottom + (compact ? 60 : 68)} onPress={onChat} />
    </LinearGradient>
  );
}

function GameHeader({
  phaseLabel,
  secondsRemaining,
  onBack,
  onHelp,
  onChat,
}: {
  phaseLabel: string;
  secondsRemaining: number;
  onBack: () => void;
  onHelp?: () => void;
  onChat?: () => void;
}) {
  const time = Math.max(0, secondsRemaining);
  const timer = `${Math.floor(time / 60).toString().padStart(2, "0")}:${(time % 60)
    .toString()
    .padStart(2, "0")}`;
  return (
    <View style={styles.header}>
      <RoundButton label="Go back" onPress={onBack}>
        <Text style={styles.backIcon}>9</Text>
      </RoundButton>
      <View style={styles.phase}>
        <Text style={styles.phaseLabel}>{phaseLabel}</Text>
        <Text style={styles.timer}>{timer}</Text>
      </View>
      <View style={styles.headerActions}>
        <RoundButton label="How to play" onPress={onHelp}>
          <Text style={styles.helpIcon}>?</Text>
        </RoundButton>
        <RoundButton label="Open chat" onPress={onChat}>
          <ChatGlyph small />
        </RoundButton>
      </View>
    </View>
  );
}

function RoundButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

function ChatButton({ bottom, onPress }: { bottom: number; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Open table chat, 1 unread message"
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chatButton,
        { bottom },
        pressed && styles.pressed,
      ]}>
      <ChatGlyph />
      <View style={styles.unread}>
        <Text style={styles.unreadText}>1</Text>
      </View>
    </Pressable>
  );
}

function BettingControls({
  state,
  amount,
  onAmountChange,
  onFold,
  onCheckOrCall,
  onRaise,
}: {
  state: BettingState;
  amount: number;
  onAmountChange: (amount: number) => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  onRaise: () => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const range = Math.max(1, state.maxRaise - state.minRaise);
  const progress = (amount - state.minRaise) / range;
  const fromEvent = (event: GestureResponderEvent) => {
    onAmountChange(state.minRaise + (event.nativeEvent.locationX / trackWidth) * range);
  };
  const callLabel = state.canCheck ? "CHECK" : `CALL $${state.callAmount ?? 0}`;
  return (
    <View style={styles.betting}>
      <View style={styles.raiseRow}>
        <Text style={styles.raiseLabel}>RAISE</Text>
        <View
          accessibilityActions={[
            { name: "increment", label: "Increase raise" },
            { name: "decrement", label: "Decrease raise" },
          ]}
          accessibilityLabel="Raise amount"
          accessibilityRole="adjustable"
          accessibilityValue={{
            min: state.minRaise,
            max: state.maxRaise,
            now: amount,
            text: `$${amount}`,
          }}
          onAccessibilityAction={(event) =>
            onAmountChange(
              amount +
                (event.nativeEvent.actionName === "increment"
                  ? state.raiseStep
                  : -state.raiseStep),
            )
          }
          onLayout={(event: LayoutChangeEvent) =>
            setTrackWidth(event.nativeEvent.layout.width)
          }
          onMoveShouldSetResponder={() => state.canRaise}
          onResponderGrant={fromEvent}
          onResponderMove={fromEvent}
          onStartShouldSetResponder={() => state.canRaise}
          style={styles.slider}>
          <View style={[styles.sliderFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.raiseAmount}>{`$${amount}`}</Text>
      </View>
      <View style={styles.actionRow}>
        <ActionButton danger disabled={!state.canFold} label="FOLD" onPress={onFold} />
        <ActionButton
          disabled={!state.canCheck && state.callAmount == null}
          label={callLabel}
          onPress={onCheckOrCall}
        />
        <ActionButton
          disabled={!state.canRaise}
          gold
          label={`RAISE $${amount}`}
          onPress={onRaise}
          wide
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { alignSelf: "center", flex: 1, width: "100%" },
  header: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: border.hairline,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  phase: { alignItems: "center", flex: 1 },
  phaseLabel: {
    color: colors.gold,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1.8,
  },
  timer: {
    color: palette.green500,
    fontFamily: fonts.monoBold,
    fontSize: 18,
    letterSpacing: 1,
    lineHeight: 20,
  },
  headerActions: { flexDirection: "row", gap: 6 },
  roundButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
    borderColor: "rgba(212,175,55,0.25)",
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  backIcon: { color: colors.gold, fontFamily: fonts.sans, fontSize: 25, lineHeight: 27 },
  helpIcon: { color: colors.gold, fontFamily: fonts.monoBold, fontSize: 11 },
  tableRegion: { flex: 1, minHeight: 272, paddingHorizontal: 8 },
  tableRegionCompact: { minHeight: 234 },
  table: { backgroundColor: "transparent", flex: 1 },
  betting: { paddingBottom: 7, paddingHorizontal: 18 },
  raiseRow: { alignItems: "center", flexDirection: "row", gap: 10, minHeight: 30 },
  raiseLabel: {
    color: colors.textDim,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  slider: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    flex: 1,
    height: 3,
    position: "relative",
  },
  sliderFill: { backgroundColor: colors.gold, borderRadius: 2, height: 3 },
  sliderThumb: {
    backgroundColor: colors.gold,
    borderColor: colors.onGold,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 14,
    marginLeft: -7,
    marginTop: -8.5,
    position: "absolute",
    width: 14,
  },
  raiseAmount: {
    color: colors.gold,
    fontFamily: fonts.monoBold,
    fontSize: 12,
    minWidth: 32,
    textAlign: "right",
  },
  actionRow: { flexDirection: "row", gap: 6, paddingTop: 4 },
  pressed: { opacity: opacity.pressed },
  chatButton: {
    alignItems: "center",
    backgroundColor: colors.gold,
    borderColor: colors.goldDeep,
    borderRadius: radius.pill,
    borderWidth: border.hairline,
    height: 46,
    justifyContent: "center",
    position: "absolute",
    right: 14,
    width: 46,
    ...elevation.modal,
  },
  unread: {
    alignItems: "center",
    backgroundColor: palette.red500,
    borderColor: palette.felt600,
    borderRadius: radius.pill,
    borderWidth: 2,
    height: 16,
    justifyContent: "center",
    position: "absolute",
    right: -2,
    top: -3,
    width: 16,
  },
  unreadText: { color: colors.onGold, fontFamily: fonts.sansBlack, fontSize: 8 },
});
