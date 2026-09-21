import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Hud,
  HUD_CHROME_HEIGHT,
  TurnClockProvider,
  useTurnClock,
  useTurnTimer,
  type BalanceView,
} from "@/components/hud";
import { PokerTable, type SeatSlot } from "@/components/table";
import { colors, fonts, layout, opacity, palette, radius, border } from "@/constants/theme";
import {
  ActionButton,
  BestWord,
  CommunityStrip,
  PlayerRack,
  PlayerSeat,
  Pot,
} from "./game-primitives";
import {
  DEVICE_CLOCK_SAMPLE,
  heroTurnPhrase,
  openTurn,
  turnKey,
} from "./game-screen-hud";
import type { BettingState, GamePlayer, GameScreenState } from "./game-types";

export interface GameScreenProps {
  game: GameScreenState;
  /**
   * What the felt draws where the seat's hand goes, or nothing for its own rack: a mode that
   * makes the hand playable (the word builder does, for §19's window) passes the interactive
   * one, so the table shows one hand rather than a rack and a copy of it.
   */
  rack?: ReactNode;
  /**
   * A mode's own control at the action row's start, beside fold, check and the bet: the word
   * builder puts its shuffle there, so the table has one control strip rather than a second
   * row of its own.
   */
  bettingLeading?: ReactNode;
  onBack?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  onRaise?: (amount: number) => void;
  onRaiseAmountChange?: (amount: number) => void;
  /** Commits the seat's whole Table Stack (§22). The felt asks for confirmation first. */
  onAllIn?: () => void;
  /** Seat tap, for a caller that opens a player view. Without it a seat is not a control. */
  onSeatPress?: (player: GamePlayer) => void;
}

/** No wallet is wired into the hand yet, so the HUD says so instead of painting `$0`. */
const BALANCE_UNAVAILABLE: BalanceView = { state: "unavailable" };

export function GameScreen(props: GameScreenProps) {
  return (
    <TurnClockProvider sample={DEVICE_CLOCK_SAMPLE}>
      <GameScreenBody {...props} />
    </TurnClockProvider>
  );
}

/** The body reads the clock, so it has to sit inside the provider rather than beside it. */
function GameScreenBody({
  game,
  rack,
  bettingLeading,
  onBack,
  onHelp,
  onSettings,
  onFold,
  onCheckOrCall,
  onRaise,
  onRaiseAmountChange,
  onAllIn,
  onSeatPress,
}: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compact = height - insets.top - insets.bottom < 690;
  // The slider's amount belongs to the round, not to the screen: a new street — or a bet the
  // hero has to answer — moves the raise floor, and an amount left over from the last round
  // would offer a raise the engine refuses. Keying on the bounds re-seeds the amount exactly
  // when they move, not while the seat is dragging.
  const boundsKey = `${game.betting.minRaise}:${game.betting.maxRaise}`;
  const [raise, setRaise] = useState({ key: boundsKey, amount: game.betting.raiseAmount });
  if (raise.key !== boundsKey) setRaise({ key: boundsKey, amount: game.betting.raiseAmount });
  const raiseAmount = Math.max(
    game.betting.minRaise,
    Math.min(Math.max(game.betting.maxRaise, game.betting.minRaise), raise.amount),
  );
  // The shared clock's reading, not a fresh clock read: a deadline derived from a new
  // sample during render would land on a slightly different timeline than the one the
  // countdown resolves against.
  const { nowMs } = useTurnClock();

  // `game.secondsRemaining` is a budget, not a deadline, so the turn is opened once per
  // value and held. Adjusting state during the render that sees a new value is what makes
  // that hold exact — a deadline derived during every render would move forward with each
  // render and the countdown would never move at all.
  const [turn, setTurn] = useState(() => openTurn(game, nowMs));
  if (turn.key !== turnKey(game)) setTurn(openTurn(game, nowMs));
  const view = useTurnTimer(turn.timing);

  const changeRaise = useCallback(
    (next: number) => {
      const { minRaise, maxRaise, raiseStep } = game.betting;
      const stepped = Math.round(next / raiseStep) * raiseStep;
      const value = Math.max(minRaise, Math.min(maxRaise, stepped));
      setRaise({ key: boundsKey, amount: value });
      onRaiseAmountChange?.(value);
    },
    [boundsKey, game.betting, onRaiseAmountChange],
  );

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [onBack]);

  return (
    <LinearGradient colors={["#0a1d17", "#051410"]} style={styles.screen}>
      <View
        style={[
          styles.content,
          {
            maxWidth: Math.min(520, width),
            paddingBottom: insets.bottom,
            paddingTop: insets.top + HUD_CHROME_HEIGHT,
          },
        ]}
      >
        <CommunityStrip tiles={game.community} />
        <View
          style={[styles.tableRegion, compact && styles.tableRegionCompact]}
        >
          <PokerTable
            chromeInset={compact ? 36 : 42}
            community={[]}
            layoutConfig={{ seatRadius: { x: 0.98, y: 0.96 }, potY: 0.5 }}
            railWidth={3}
            renderCommunity={() => null}
            renderPot={() => <Pot amount={game.pot} sidePots={game.sidePots} />}
            renderSeat={(slot) => <Seat onPress={onSeatPress} slot={slot} />}
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
        {rack ?? (
          <PlayerRack
            community={game.community}
            privateTiles={game.privateTiles}
          />
        )}
        <BettingControls
          amount={raiseAmount}
          leading={bettingLeading}
          onAllIn={onAllIn}
          onAmountChange={changeRaise}
          onCheckOrCall={onCheckOrCall}
          onFold={onFold}
          onRaise={onRaise ? () => onRaise(raiseAmount) : undefined}
          state={game.betting}
        />
      </View>
      <Hud
        balance={BALANCE_UNAVAILABLE}
        onHelp={onHelp}
        onLeave={goBack}
        onSettings={onSettings}
        phase={game.phase}
        style={{ top: insets.top }}
        turn={view}
        turnPhrase={heroTurnPhrase(game)}
      />
    </LinearGradient>
  );
}

/**
 * A seat as the table draws it, with the screen's optional tap layered around it. With no
 * handler this is exactly the presentational seat: a seat that looks tappable but goes
 * nowhere is worse than one that never was.
 */
function Seat({
  slot,
  onPress,
}: {
  slot: SeatSlot<GamePlayer>;
  onPress?: (player: GamePlayer) => void;
}) {
  const player = slot.seat;
  if (!player || !onPress) return <PlayerSeat {...slot} />;
  return (
    <Pressable
      accessibilityLabel={`${player.name}'s seat`}
      accessibilityRole="button"
      hitSlop={layout.hitSlop}
      onPress={() => onPress(player)}
    >
      <PlayerSeat {...slot} />
    </Pressable>
  );
}

function BettingControls({
  state,
  amount,
  leading,
  onAmountChange,
  onFold,
  onCheckOrCall,
  onRaise,
  onAllIn,
}: {
  state: BettingState;
  amount: number;
  /** A mode's own control for the row's start, drawn before fold. */
  leading?: ReactNode;
  onAmountChange: (amount: number) => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  onRaise?: () => void;
  onAllIn?: () => void;
}) {
  const [trackWidth, setTrackWidth] = useState(1);
  const [allInOpen, setAllInOpen] = useState(false);
  // The turn can move on under the sheet — the hero's own clock, most often — and a seat that
  // no longer has a stack to commit is not asked to confirm one.
  if (allInOpen && !state.canAllIn) setAllInOpen(false);

  const range = Math.max(1, state.maxRaise - state.minRaise);
  const progress = (amount - state.minRaise) / range;
  const fromEvent = (event: GestureResponderEvent) => {
    onAmountChange(
      state.minRaise + (event.nativeEvent.locationX / trackWidth) * range,
    );
  };
  const callLabel = state.canCheck ? "CHECK" : `CALL $${(state.callAmount ?? 0).toLocaleString()}`;
  // The same slider opens the round or raises it: with no bet out the action is a bet, and
  // the amount is the round total either way (§22).
  const wagerLabel = state.canBet ? "BET" : "RAISE";
  return (
    <View style={styles.betting}>
      <View style={styles.raiseRow}>
        <Text style={styles.raiseLabel}>{wagerLabel}</Text>
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
          onMoveShouldSetResponder={() => state.canRaise || state.canBet}
          onResponderGrant={fromEvent}
          onResponderMove={fromEvent}
          onStartShouldSetResponder={() => state.canRaise || state.canBet}
          style={styles.slider}
        >
          <View style={[styles.sliderFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.sliderThumb, { left: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.raiseAmount}>{`$${amount.toLocaleString()}`}</Text>
      </View>
      <View style={styles.actionRow}>
        {leading}
        <ActionButton
          danger
          disabled={!state.canFold}
          label="FOLD"
          onPress={onFold}
        />
        <ActionButton
          disabled={!state.canCheck && state.callAmount == null}
          label={callLabel}
          onPress={onCheckOrCall}
          // The one control the row arms for two actions, so a test cannot name it by its label:
          // the felt's nameplates print CHECK and CALL as seat status too, and a text selector
          // lands on whichever the tree puts first.
          testID="action-check-call"
        />
        <ActionButton
          disabled={!state.canRaise && !state.canBet}
          gold
          label={`${wagerLabel} $${amount.toLocaleString()}`}
          onPress={onRaise}
          wide
        />
        <ActionButton
          compact
          disabled={!state.canAllIn}
          gold
          label={`ALL IN · $${state.allInAmount.toLocaleString()}`}
          onPress={() => setAllInOpen(true)}
          testID="all-in-button"
        />
      </View>
      <Modal
        animationType="fade"
        onRequestClose={() => setAllInOpen(false)}
        transparent
        visible={allInOpen}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet} testID="all-in-sheet">
            <Text style={styles.sheetTitle}>
              {`ALL IN · $${state.allInAmount.toLocaleString()}`}
            </Text>
            <Text style={styles.sheetBody}>Commits your entire Table Stack.</Text>
            <View style={styles.sheetActions}>
              <ActionButton
                label="CANCEL"
                onPress={() => setAllInOpen(false)}
                testID="all-in-cancel"
              />
              <ActionButton
                gold
                label="CONFIRM ALL IN"
                onPress={() => {
                  setAllInOpen(false);
                  onAllIn?.();
                }}
                testID="all-in-confirm"
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { alignSelf: "center", flex: 1, width: "100%" },
  tableRegion: { flex: 1, minHeight: 272, paddingHorizontal: 8 },
  tableRegionCompact: { minHeight: 234 },
  table: { backgroundColor: "transparent", flex: 1 },
  betting: { paddingBottom: 7, paddingHorizontal: 18 },
  raiseRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 30,
  },
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
  // The all-in sheet is the felt's own surface rather than an OS alert: the amount it commits
  // is the point of the confirmation, and it stays inside the table's frame.
  sheetBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(2,12,9,0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: palette.felt800,
    borderColor: colors.goldDeep,
    borderRadius: radius.card,
    borderWidth: border.hairline,
    maxWidth: 320,
    padding: 16,
    width: "100%",
  },
  sheetTitle: {
    color: colors.gold,
    fontFamily: fonts.serifBold,
    fontSize: 18,
    textAlign: "center",
  },
  sheetBody: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  sheetActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  pressed: { opacity: opacity.pressed },
});
