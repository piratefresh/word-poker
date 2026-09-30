import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import {
  Modal,
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
  TurnClockProvider,
  useTurnClock,
  useTurnTimer,
  useHudChromeHeight,
  type BalanceView,
} from "@/components/hud";
import { ChipLayer, PokerTable, type SeatSlot } from "@/components/table";
import { GameButton } from "@/components/ui/game-button";
import { formatCompactAmount } from "./format-amount";
import {
  border,
  colors,
  fonts,
  opacity,
  palette,
  radius,
} from "@/constants/theme";
import { ActionBarShade } from "./action-bar-shade";
import { BackdropPicker } from "./backdrop-picker";
import { BackdropUrgencyProvider } from "./backdrop-style";
import {
  stageMaxWidth,
  tableMaxWidth,
  useCompactControls,
  useScreenScale,
} from "./screen-scale";
import {
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
import { playerSeatBounds, tableSeating } from "./seat-metrics";
import { TableBackdrop } from "./table-backdrop";

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
  /** A mode's own control at the end of the bet slider's row: the word builder's word check. */
  bettingSlider?: ReactNode;
  onBack?: () => void;
  onHelp?: () => void;
  onSettings?: () => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  /**
   * The wager row's one slider, and the two actions it can be: with no bet out it opens the
   * round (`onBet`), and facing one it raises to the amount (§22). Each is named as the engine
   * names it, and the felt calls the one its own button is labelled with — a mode wires the
   * engine action the button says, rather than re-deriving which action the amount was for.
   */
  onBet?: (amount: number) => void;
  onRaise?: (amount: number) => void;
  onRaiseAmountChange?: (amount: number) => void;
  /** Commits the seat's whole Table Stack (§22). The felt asks for confirmation first. */
  onAllIn?: () => void;
  /**
   * A chip flight that has landed, reported with the id it was drawn under — the mode's adapter
   * is what prunes it. A table that never animates chips passes nothing: the layer still draws
   * what the state holds, and the state is the adapter's to empty.
   */
  onChipFlightEnd?: (id: string) => void;
  /** Seat tap, for a caller that opens a player view. Without it a seat is not a control. */
  onSeatPress?: (player: GamePlayer) => void;
  /**
   * The table before its first deal: the HUD names it with `stamp` and runs no clock, and
   * `controls` stand where the betting row goes — the same place a seat will look once the hand
   * is live, so the one thing it can do now (say it is ready) is where its moves will be.
   */
  waiting?: { stamp: string; controls: ReactNode };
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
  bettingSlider,
  onBack,
  onHelp,
  onSettings,
  onFold,
  onCheckOrCall,
  onBet,
  onRaise,
  onRaiseAmountChange,
  onAllIn,
  onChipFlightEnd,
  onSeatPress,
  waiting,
}: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const hudHeight = useHudChromeHeight();
  const [backdropOpen, setBackdropOpen] = useState(false);
  const window = useWindowDimensions();
  const { height } = window;
  const stageWidth = stageMaxWidth(window);
  const tableWidth = tableMaxWidth(window);
  const shadeFeather = 28 * useScreenScale();
  const [barHeight, setBarHeight] = useState(0);
  const compact = height - insets.top - insets.bottom < 690;
  const tight = useCompactControls();
  // The slider's amount belongs to the round, not to the screen: a new street — or a bet the
  // hero has to answer — moves the raise floor, and an amount left over from the last round
  // would offer a raise the engine refuses. Keying on the bounds re-seeds the amount exactly
  // when they move, not while the seat is dragging.
  const boundsKey = `${game.betting.minRaise}:${game.betting.maxRaise}`;
  const [raise, setRaise] = useState({
    key: boundsKey,
    amount: game.betting.raiseAmount,
  });
  if (raise.key !== boundsKey)
    setRaise({ key: boundsKey, amount: game.betting.raiseAmount });
  const raiseAmount = Math.max(
    game.betting.minRaise,
    Math.min(
      Math.max(game.betting.maxRaise, game.betting.minRaise),
      raise.amount,
    ),
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

  // The wager row is one slider with one press, and its label is what says which action that
  // press takes: `canBet` names it BET, and the same fact picks the engine action behind it. A
  // mode that armed the control for a bet is told it was a bet — nothing re-derives it.
  const commitWager = game.betting.canBet ? onBet : onRaise;
  const seating = tableSeating(game.seatCount);

  return (
    <LinearGradient colors={["#0a1d17", "#051410"]} style={styles.screen}>
      <BackdropUrgencyProvider
        value={waiting || view.paused ? 0 : view.elapsedFraction}
      >
        <TableBackdrop />
      </BackdropUrgencyProvider>
      {/* The painted shadow the action bar sits on: full screen width so it has no side edges,
          running to the bottom of the screen under the home-indicator inset, and it fades out
          `shadeFeather` above the bar. Under the content layer, and it takes no touches. */}
      {barHeight > 0 ? (
        <View
          pointerEvents="none"
          style={[
            styles.barShade,
            { height: barHeight + insets.bottom + shadeFeather },
          ]}
        >
          <ActionBarShade feather={shadeFeather} />
        </View>
      ) : null}
      {/* Above the HUD, so the community label reads over the timer banner's hanging tip; the
          layer takes no touches of its own, so the HUD's buttons stay pressable. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.content,
          {
            maxWidth: stageWidth,
            paddingBottom: insets.bottom,
            paddingTop: insets.top + hudHeight,
          },
        ]}
      >
        <CommunityStrip tiles={game.community} />
        <View
          style={[
            styles.tableRegion,
            compact && styles.tableRegionCompact,
            tight && tableWidth === undefined && styles.tableRegionTight,
            tableWidth !== undefined && {
              alignSelf: "center",
              maxWidth: tableWidth,
              width: "100%",
            },
          ]}
        >
          <PokerTable
            community={[]}
            hud={
              // The chips in flight go over the felt, inside the table's own layout provider: the
              // layer is in the container's pixel space, exactly as `resolveContainer` reads it.
              <ChipLayer flights={game.flights} onFlightEnd={onChipFlightEnd} />
            }
            // The table runs to the room's edges.
            chromeInset={0}
            layoutConfig={seating.layoutConfig}
            renderCommunity={() => null}
            renderPot={({ size }) => (
              <Pot
                amount={game.pot}
                sidePots={game.sidePots}
                blinds={game.blinds}
                tableWidth={size.width}
              />
            )}
            renderSeat={(slot) => <Seat onPress={onSeatPress} slot={slot} />}
            // The seats scale with the felt and, at up to four, sit inside the table — avatars
            // on the felt, labels at most on the rail — so the table fills its room.
            seatBounds={playerSeatBounds}
            seatPlacement={seating.seatPlacement}
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
        <View
          onLayout={(event: LayoutChangeEvent) =>
            setBarHeight(event.nativeEvent.layout.height)
          }
        >
          {waiting ? (
            <View style={styles.betting}>{waiting.controls}</View>
          ) : (
            <BettingControls
              amount={raiseAmount}
              leading={bettingLeading}
              sliderTrailing={bettingSlider}
              onAllIn={onAllIn}
              onAmountChange={changeRaise}
              onCheckOrCall={onCheckOrCall}
              onFold={onFold}
              onWager={commitWager ? () => commitWager(raiseAmount) : undefined}
              state={game.betting}
            />
          )}
        </View>
      </View>
      <Hud
        balance={BALANCE_UNAVAILABLE}
        handId={game.handId}
        onHelp={onHelp}
        onLeave={goBack}
        // Until the table has a settings sheet, the gear opens the backdrop picker.
        onSettings={onSettings ?? (() => setBackdropOpen((open) => !open))}
        phase={game.phase}
        stamp={waiting?.stamp}
        style={{ top: insets.top }}
        turn={waiting ? null : view}
        turnPhrase={heroTurnPhrase(game)}
      />
      {backdropOpen ? (
        <BackdropPicker
          onClose={() => setBackdropOpen(false)}
          top={insets.top + hudHeight}
        />
      ) : null}
    </LinearGradient>
  );
}

/**
 * A seat as the table draws it, with the screen's optional tap. The seat owns the press, so the
 * control is the box the seat is placed by — the avatar on its anchor, and the labels under it.
 */
function Seat({
  slot,
  onPress,
}: {
  slot: SeatSlot<GamePlayer>;
  onPress?: (player: GamePlayer) => void;
}) {
  return <PlayerSeat {...slot} onPress={onPress} />;
}

function BettingControls({
  state,
  amount,
  leading,
  sliderTrailing,
  onAmountChange,
  onFold,
  onCheckOrCall,
  onWager,
  onAllIn,
}: {
  state: BettingState;
  amount: number;
  /** A mode's own control for the row's start, drawn before fold. */
  leading?: ReactNode;
  /** A mode's own control after the slider's amount, sharing the slider's row. */
  sliderTrailing?: ReactNode;
  onAmountChange: (amount: number) => void;
  onFold?: () => void;
  onCheckOrCall?: () => void;
  /** Commits `amount` as the action the button is labelled with — a bet, or a raise. */
  onWager?: () => void;
  onAllIn?: () => void;
}) {
  const scale = useScreenScale();
  const tight = useCompactControls();
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
  // §19's window keeps the check's own word on the confirm: the row's check is what locks it in.
  // The same slider opens the round or raises it: with no bet out the action is a bet, and
  // the amount is the round total either way (§22).
  const wagerLabel = state.wager === "bet" ? "BET" : "RAISE";
  return (
    <View style={[styles.betting, tight && styles.bettingTight]}>
      <View style={styles.raiseRow}>
        <Text
          style={[styles.raiseLabel, scale !== 1 && { fontSize: 9 * scale }]}
        >
          {wagerLabel}
        </Text>
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
          style={[styles.slider, scale !== 1 && { height: 3 * scale }]}
        >
          <View
            style={[
              styles.sliderFill,
              scale !== 1 && { height: 3 * scale },
              { width: `${progress * 100}%` },
            ]}
          />
          <View
            style={[
              styles.sliderThumb,
              scale !== 1 && {
                height: 14 * scale,
                marginLeft: -7 * scale,
                marginTop: -8.5 * scale,
                width: 14 * scale,
              },
              { left: `${progress * 100}%` },
            ]}
          />
        </View>
        <Text
          style={[
            styles.raiseAmount,
            scale !== 1 && { fontSize: 12 * scale, minWidth: 32 * scale },
          ]}
        >{`${amount.toLocaleString()}`}</Text>
        {sliderTrailing}
      </View>
      <View style={[styles.actionRow, tight && styles.actionRowTight]}>
        {leading}
        {/* The row's controls carry ids as well as labels: the felt's nameplates print
            CHECK, CALL and FOLD as seat status too, so a device flow that matched the
            row by text alone could land on a seat instead of a control (see
            .maestro/native/offline-hand.yaml). */}
        <GameButton
          disabled={!state.canFold}
          label="FOLD"
          onPress={onFold}
          compact={tight}
          scale={scale}
          style={styles.action}
          testID="action-fold"
          variant="danger"
        />
        <GameButton
          disabled={!state.canCheck && state.callAmount == null}
          amount={
            state.primary === "call"
              ? formatCompactAmount(state.callAmount ?? 0)
              : undefined
          }
          label={state.primary === "call" ? "CALL" : "CHECK"}
          onPress={onCheckOrCall}
          compact={tight}
          scale={scale}
          style={styles.callAction}
          // The one control the row arms for two actions, so a test cannot name it by its label:
          // the felt's nameplates print CHECK and CALL as seat status too, and a text selector
          // lands on whichever the tree puts first.
          testID="action-check-call"
        />
        <GameButton
          disabled={!state.canRaise && !state.canBet}
          amount={formatCompactAmount(amount)}
          label={wagerLabel}
          onPress={onWager}
          compact={tight}
          scale={scale}
          style={styles.wideAction}
          testID="action-wager"
          variant="gold"
        />
        <GameButton
          disabled={!state.canAllIn}
          // ALL IN is an action, not an amount: the stack is already on the felt and the
          // confirm sheet still names what it commits.
          label="ALL IN"
          onPress={() => setAllInOpen(true)}
          compact={tight}
          scale={scale}
          style={styles.allInAction}
          testID="all-in-button"
          variant="gold"
        />
      </View>
      <Modal
        animationType="fade"
        onRequestClose={() => setAllInOpen(false)}
        transparent
        visible={allInOpen}
      >
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet} testID="all-in-sheet">
            <Text style={styles.sheetTitle}>
              {`ALL IN · $${state.allInAmount.toLocaleString()}`}
            </Text>
            <Text style={styles.sheetBody}>
              Commits your entire Table Stack.
            </Text>
            <View style={styles.sheetActions}>
              <GameButton
                label="CANCEL"
                onPress={() => setAllInOpen(false)}
                style={styles.action}
                testID="all-in-cancel"
              />
              <GameButton
                label="CONFIRM ALL IN"
                style={styles.action}
                variant="gold"
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
  content: { alignSelf: "center", flex: 1, width: "100%", zIndex: 1 },
  barShade: { bottom: 0, left: 0, position: "absolute", right: 0 },
  tableRegion: { flex: 1, minHeight: 272 },
  tableRegionCompact: { minHeight: 234 },
  // A small phone: the felt is narrower than the screen, so the height it keeps goes to the word.
  tableRegionTight: { alignSelf: "center", width: "86%" },
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
  bettingTight: { paddingHorizontal: 12 },
  actionRowTight: { gap: 4 },
  actionRow: { flexDirection: "row", gap: 6, paddingTop: 4 },
  /** A control that shares the row's width with its neighbours. */
  action: { flex: 1 },
  /** Call and all in sit a little wider than fold; raise gets the most room (≈62/68/78/68). */
  callAction: { flex: 1.1 },
  wideAction: { flex: 1.25 },
  allInAction: { flex: 1.1 },
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
