import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useState, type ReactNode } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  Hud,
  TurnClockProvider,
  useHudChromeHeight,
  type BalanceView,
} from "@/components/hud";
import { ChipLayer, PokerTable } from "@/components/table";
import { CoachTarget } from "@/components/ui/coach";

import {
  ActionBarShade,
  BackdropPicker,
  BackdropUrgencyProvider,
  TableBackdrop,
  useBackdropStyle,
} from "./backdrop";
import { BettingControls, bettingRowStyle, useRaiseAmount } from "./betting";
import type { GamePlayer, GameScreenState } from "./game-types";
import {
  BestWord,
  CommunityStrip,
  PlayerRack,
  PlayerSeat,
  Pot,
} from "./primitives";
import {
  stageMaxWidth,
  tableMaxWidth,
  useCompactControls,
  useScreenScale,
} from "./screen-scale";
import { playerSeatBounds, tableSeating } from "./seat-metrics";
import { DEVICE_CLOCK_SAMPLE, heroTurnPhrase, useHandTurn } from "./turn";

export interface GameScreenProps {
  game: GameScreenState;
  /**
   * What the felt draws where the seat's hand goes, or nothing for its own rack: a mode that
   * makes the hand playable (the word builder does, for §19's window) passes the interactive
   * one, so the table shows one hand rather than a rack and a copy of it.
   */
  rack?: ReactNode;
  /**
   * A mode's own control at the action row's start, beside fold, check and the bet: a Wild
   * table's held power sits there.
   */
  bettingLeading?: ReactNode;
  /**
   * A mode's own controls in a row right under the rack: the word builder's shuffle and word
   * check, so the word's controls sit with the tiles they act on and the betting rows keep
   * their width. A table that has not dealt yet has no hand to act on, so draws none.
   */
  rackActions?: ReactNode;
  /**
   * What a mode draws over the felt itself — §44's Power Draw, the "power used" card. It fills the
   * table's region and nothing past it, so the community above and the rack below stay in view.
   */
  overFelt?: ReactNode;
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
  /**
   * The table's clock is held — the tutorial's, while the coach explains — so the countdown
   * stands still with it and carries on from the same place when released.
   */
  clockHeld?: boolean;
  /**
   * A lesson's step that wants the rack alone: fold, check, the wager, all in and the slider are
   * drawn disabled until it lets them go. The mode's own controls in the row stay live.
   */
  actionsLocked?: boolean;
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
  rackActions,
  overFelt,
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
  clockHeld = false,
  actionsLocked = false,
}: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const hudHeight = useHudChromeHeight();
  const [backdropOpen, setBackdropOpen] = useState(false);
  const window = useWindowDimensions();
  const { height } = window;
  const stageWidth = stageMaxWidth(window);
  const backdrop = useBackdropStyle();
  const roomSeating = backdrop === "tavern" || backdrop === "planet";
  const chromeWidth = tableMaxWidth(window) ?? window.width;
  const tableWidth = roomSeating ? undefined : tableMaxWidth(window);
  const shadeFeather = 28 * useScreenScale();
  const [barHeight, setBarHeight] = useState(0);
  const compact = height - insets.top - insets.bottom < 690;
  const tight = useCompactControls();
  const [raiseAmount, changeRaise] = useRaiseAmount(
    game.betting,
    onRaiseAmountChange,
  );
  const view = useHandTurn(game, clockHeld);

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
        <CoachTarget id="community">
          <CommunityStrip tiles={game.community} />
        </CoachTarget>
        <CoachTarget
          id="table"
          style={[
            styles.tableRegion,
            compact && styles.tableRegionCompact,
            !roomSeating && tight && tableWidth === undefined && styles.tableRegionTight,
            tableWidth !== undefined && {
              alignSelf: "center",
              maxWidth: tableWidth,
              width: "100%",
            },
          ]}
        >
          <PokerTable
            appearanceWidth={roomSeating ? chromeWidth : undefined}
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
            renderPot={({ size, appearanceWidth }) => (
              <Pot
                amount={game.pot}
                sidePots={game.sidePots}
                blinds={game.blinds}
                tableWidth={appearanceWidth ?? size.width}
              />
            )}
            renderSeat={(slot) => <PlayerSeat {...slot} onPress={onSeatPress} />}
            // The seats scale with the felt and, at up to four, sit inside the table — avatars
            // on the felt, labels at most on the rail — so the table fills its room.
            seatBounds={playerSeatBounds}
            seatPlacement={roomSeating ? "room" : seating.seatPlacement}
            seatCount={game.seatCount}
            seats={game.players}
            style={styles.table}
            testID="poker-table"
          />
          {overFelt}
        </CoachTarget>
        <BestWord
          payout={game.phase === "payout"}
          score={game.bestScore}
          word={game.bestWord}
        />
        <CoachTarget id="rack">
          {rack ?? (
            <PlayerRack
              community={game.community}
              privateTiles={game.privateTiles}
            />
          )}
          {rackActions == null || waiting ? null : (
            <View style={styles.rackActions}>{rackActions}</View>
          )}
        </CoachTarget>
        <View
          onLayout={(event: LayoutChangeEvent) =>
            setBarHeight(event.nativeEvent.layout.height)
          }
        >
          {waiting ? (
            <View style={styles.waiting}>{waiting.controls}</View>
          ) : (
            <BettingControls
              amount={raiseAmount}
              leading={bettingLeading}
              locked={actionsLocked}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { alignSelf: "center", flex: 1, width: "100%", zIndex: 1 },
  barShade: { bottom: 0, left: 0, position: "absolute", right: 0 },
  tableRegion: { flex: 1, minHeight: 272 },
  tableRegionCompact: { minHeight: 234 },
  // A small phone: the felt is narrower than the screen, so the height it keeps goes to the word.
  tableRegionTight: { alignSelf: "center", width: "86%" },
  table: { backgroundColor: "transparent", flex: 1 },
  waiting: bettingRowStyle,
  rackActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingTop: 6,
  },
});
