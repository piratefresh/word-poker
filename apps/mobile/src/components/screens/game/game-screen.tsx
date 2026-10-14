import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
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
  hangsModeTag,
  useHudChromeHeight,
  type BalanceView,
} from "@/components/hud";
import { MODE_TAG_BLOCK } from "@/components/hud/top-bar/banner";
import { ChipLayer, PokerTable, useTableLayout } from "@/components/table";
import { CoachTarget } from "@/components/ui/coach";

import {
  TableBackdrop,
} from "./backdrop";
import { CoinBowlGameContext } from "./backdrop/coin-bowl-motion";
import { BettingControls, bettingRowStyle, useRaiseAmount } from "./betting";
import type { GamePlayer, GameScreenState, LetterTileData } from "./game-types";
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
import {
  COMMUNITY_ROW_HEIGHT,
  seatMetrics,
  tableSeating,
  tabletopSeatBounds,
} from "./seat-metrics";
import { DEVICE_CLOCK_SAMPLE, heroTurnPhrase, useHandTurn } from "./turn";

export interface GameScreenProps {
  game: GameScreenState;
  /**
   * What the header's balance chip reads — each mode states its own economy rather than the
   * felt guessing one: an online seat passes its Wallet read (`useBalanceView`), free play
   * (offline, tutorial) passes the shared `FREE_PLAY`.
   */
  balance: BalanceView;
  /** Where the signed-out chip goes: the online felt routes its tap to sign-in. */
  onBalancePress?: () => void;
  /**
   * What the felt draws where the seat's hand goes, or nothing for its own rack: a mode that
   * makes the hand playable (the word builder does, for §19's window) passes the interactive
   * one, so the table shows one hand rather than a rack and a copy of it.
   */
  rack?: ReactNode;
  /**
   * A mode's own controls in a row right under the rack: the word builder's shuffle and word
   * check, so the word's controls sit with the tiles they act on and the betting rows keep their
   * width. A table that has not dealt yet has no hand to act on, so draws none.
   */
  rackActions?: ReactNode;
  /** A mode's control placed just left of the hero's seat on the felt. */
  heroSideAccessory?: ReactNode;
  /**
   * What a mode draws over the felt itself — §44's Power Draw, the "power used" card. It fills the
   * table's region and nothing past it, so the community above and the rack below stay in view.
   */
  overFelt?: ReactNode;
  /** Clears the pot from the middle of the felt, so the Power Draw's cards have the room. */
  hidePot?: boolean;
  /** Spotlight's aim: while set, a tap on a dealt community tile with no bonus picks it. */
  onPickCommunityTile?: (tile: LetterTileData) => void;
  /** A short, presentation-only celebration above the table after a showdown. */
  winOverlay?: ReactNode;
  onBack?: () => void;
  onHelp?: () => void;
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
  balance,
  rack,
  rackActions,
  heroSideAccessory,
  overFelt,
  hidePot,
  winOverlay,
  onPickCommunityTile,
  onBack,
  onHelp,
  onBalancePress,
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
  const window = useWindowDimensions();
  const { height } = window;
  const stageWidth = stageMaxWidth(window);
  // In landscape the table fills the screen and the builder and the betting panel stand in side
  // columns over its lower corners, leaving the pot and hero between them.
  const landscape = window.width > window.height;
  const scale = useScreenScale();
  const tight = useCompactControls();
  const [controlsHeight, setControlsHeight] = useState(0);
  // Portrait's controls reach into the home indicator's band: half of it stays clear for the
  // swipe, the rest goes to the felt instead of standing empty under the action row.
  const bottomInset = landscape ? insets.bottom : Math.round(insets.bottom / 2);
  const tableHeight = height - insets.top - bottomInset - hudHeight - (landscape ? 0 : controlsHeight);
  // Short phones need extra clearance for the deeper two-slot tabletop rack.
  const roomChromeWidth = Math.max(tight ? 220 : 240, tableHeight * (400 / (tight ? 540 : 470)));
  const chromeWidth = Math.min(tableMaxWidth(window) ?? window.width, roomChromeWidth);
  const compact = height - insets.top - insets.bottom < 690;
  const [raiseAmount, changeRaise] = useRaiseAmount(
    game.betting,
    onRaiseAmountChange,
    game.id,
  );
  const view = useHandTurn(game, clockHeld);

  // Who the wager button waits on: the seat wearing "thinking" is the one acting. The hero
  // keeps the live face on their own turn — illegal actions included, which stay disabled —
  // and through §19's word window, which arms the confirm while it is nobody's acting turn:
  // that wait is the hero's own. No acting seat (between streets, payout) is a wait with no
  // name and no clock to drain.
  const actingSeat = game.players.find((player) => player?.status === "thinking") ?? null;
  const rowIsHeros =
    game.players.find((player) => player?.isHero)?.status === "your-turn" ||
    game.betting.primary === "confirm";

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [onBack]);

  // The wager row is one slider with one press, and its label is what says which action that
  // press takes: `canBet` names it BET, and the same fact picks the engine action behind it. A
  // mode that armed the control for a bet is told it was a bet — nothing re-derives it.
  const commitWager = game.betting.canBet ? onBet : onRaise;
  const seating = tableSeating(game.seatCount, true);
  const layoutConfig = useMemo(() => {
    const landscapeLayout = landscape
      // The pot sits below the community row, same as portrait, so the row reads as five tiles
      // in a line rather than three, a gap, then two.
      ? { communityY: 0.47, potY: 0.62 }
      : {};
    if (!landscape || (game.seatCount !== 2 && game.seatCount !== 4)) {
      return { ...seating.layoutConfig, ...landscapeLayout };
    }
    const seatAngles = [...(seating.layoutConfig.seatAngles ?? [])];
    seatAngles[game.seatCount === 2 ? 1 : 2] = 1.5 * Math.PI;
    return { ...seating.layoutConfig, ...landscapeLayout, seatAngles };
  }, [game.seatCount, landscape, seating]);
  // In landscape the top opponent sits just below the HUD, centered under the phase capsule.
  const seatPositionOverrides = useMemo(() => {
    if (!landscape || (game.seatCount !== 2 && game.seatCount !== 4)) return undefined;
    return {
      [game.seatCount === 2 ? 1 : 2]: {
        y: (12 + 68 * scale - hudHeight) / Math.max(1, tableHeight),
      },
    };
  }, [game.seatCount, landscape, scale, hudHeight, tableHeight]);

  // Keep the mode under the capsule in portrait; the table reserves its clearance below.
  const modeTag = hangsModeTag(balance, window);

  const rackBlock = (
    <>
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
    </>
  );
  const bettingBlock = (
    <View
      style={
        !waiting && !landscape &&
        (rackActions != null ? styles.bettingCloser : styles.bettingTucked)
      }
    >
      {waiting ? (
        <View style={styles.waiting}>{waiting.controls}</View>
      ) : (
        <BettingControls
          amount={raiseAmount}
          locked={actionsLocked}
          waitingOn={rowIsHeros
            ? undefined
            : { name: actingSeat?.name, view: actingSeat ? view : undefined }}
          onAllIn={onAllIn}
          onAmountChange={changeRaise}
          onCheckOrCall={onCheckOrCall}
          onFold={onFold}
          onWager={commitWager ? () => commitWager(raiseAmount) : undefined}
          pot={game.pot}
          state={game.betting}
        />
      )}
    </View>
  );

  return (
    <LinearGradient colors={["#0a1d17", "#051410"]} style={styles.screen}>
      {/* The backdrop's coin bowl and the pot bowl both play the table's turns. */}
      <CoinBowlGameContext.Provider value={game}>
      <TableBackdrop />
      {/* Above the HUD, so the community label reads over the timer banner's hanging tip; the
          layer takes no touches of its own, so the HUD's buttons stay pressable. */}
      <View
        pointerEvents="box-none"
        style={[
          styles.content,
          {
            maxWidth: landscape ? undefined : stageWidth,
            paddingBottom: bottomInset,
            paddingLeft: landscape ? insets.left : 0,
            paddingRight: landscape ? insets.right : 0,
            paddingTop: insets.top + hudHeight,
          },
        ]}
      >
        <CoachTarget
          id="table"
          style={[
            styles.tableRegion,
            landscape && styles.tableRegionLandscape,
            !landscape && compact && styles.tableRegionCompact,
          ]}
        >
          <PokerTable
            seatPositionOverrides={seatPositionOverrides}
            appearanceWidth={chromeWidth}
            community={[]}
            /* The header's mode tag hangs over the room's top; the seats start below it. */
            topChrome={modeTag ? MODE_TAG_BLOCK : 0}
            hud={
              // The chips in flight go over the felt, inside the table's own layout provider: the
              // layer is in the container's pixel space, exactly as `resolveContainer` reads it.
              <>
                <CommunityInTable
                  onPick={onPickCommunityTile}
                  scale={scale}
                  tiles={game.community}
                />
                <ChipLayer flights={game.flights} onFlightEnd={onChipFlightEnd} />
                {overFelt}
                {heroSideAccessory == null ? null : (
                  <HeroSeatAccessory
                    avatarSize={seatMetrics(chromeWidth, true).avatar}
                    gap={8 * scale}
                    heroSeatIndex={game.players.findIndex((player) => player?.isHero)}
                  >
                    {heroSideAccessory}
                  </HeroSeatAccessory>
                )}
              </>
            }
            // The table runs to the room's edges.
            chromeInset={0}
            layoutConfig={layoutConfig}
            renderCommunity={() => null}
            renderPot={({ size, appearanceWidth }) =>
              hidePot ? null : (
                <Pot
                  amount={game.pot}
                  sidePots={game.sidePots}
                  blinds={game.blinds}
                  tableWidth={appearanceWidth ?? size.width}
                  tabletop
                />
              )
            }
            renderSeat={(slot) => (
              <PlayerSeat {...slot} dealt={!waiting} onPress={onSeatPress} tabletop />
            )}
            // The seats scale with the felt and, at up to four, sit inside the table — avatars
            // on the felt, labels at most on the rail — so the table fills its room.
            seatBounds={tabletopSeatBounds}
            seatPlacement="room"
            seatCount={game.seatCount}
            seats={game.players}
            style={[styles.table, landscape && { overflow: "visible" }]}
            testID="poker-table"
          />
          {winOverlay}
        </CoachTarget>
        {landscape ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.bottomBand,
              {
                bottom: insets.bottom,
                left: insets.left,
                right: insets.right,
              },
            ]}
          >
            <View
              style={[
                styles.sideColumn,
                styles.wordBuilderColumn,
                { width: 400 * scale },
              ]}
            >
              {rackBlock}
            </View>
            <View style={[styles.bettingColumn, { width: 280 * scale }]}>
              {bettingBlock}
            </View>
          </View>
        ) : (
          <View testID="game-controls" onLayout={(event: LayoutChangeEvent) => setControlsHeight(event.nativeEvent.layout.height)}>
            {rackBlock}
            {bettingBlock}
          </View>
        )}
      </View>
      <Hud
        balance={balance}
        handId={game.handId}
        modeTag={modeTag}
        onBalancePress={onBalancePress}
        onHelp={onHelp}
        onLeave={goBack}
        phase={game.phase}
        stamp={waiting?.stamp}
        style={{ top: insets.top }}
        turn={waiting ? null : view}
        turnPhrase={heroTurnPhrase(game)}
      />
      </CoinBowlGameContext.Provider>
    </LinearGradient>
  );
}

/**
 * The tabletop's community row, centred on the layout's community anchor. It stays one view so
 * the tutorial's `community` target has a box to highlight; the box has a real height because
 * Android does not draw a child spilling out of a zero-size anchor (STO-516).
 */
function CommunityInTable({
  tiles,
  scale,
  onPick,
}: {
  tiles: GameScreenState["community"];
  scale: number;
  onPick?: (tile: LetterTileData) => void;
}) {
  const { layout, resolveContainer } = useTableLayout();
  const center = resolveContainer({ x: 0.5, y: layout.config.communityY });
  const height = COMMUNITY_ROW_HEIGHT * scale;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.communityInTable, { height, top: center.y - height / 2 }]}
    >
      <CoachTarget id="community">
        <CommunityStrip inTable onPick={onPick} scale={scale} tiles={tiles} />
      </CoachTarget>
    </View>
  );
}

/** Places a control to the left of the hero avatar, measured in the table's shared pixel space. */
function HeroSeatAccessory({
  avatarSize,
  gap,
  heroSeatIndex,
  children,
}: {
  avatarSize: number;
  gap: number;
  heroSeatIndex: number;
  children: ReactNode;
}) {
  const { layout, resolveContainer } = useTableLayout();
  const [accessorySize, setAccessorySize] = useState({ width: 0, height: 0 });
  const hero = layout.seats[heroSeatIndex];
  if (hero === undefined) return null;

  const point = resolveContainer(hero);
  const left = Math.max(0, point.x - avatarSize / 2 - gap - accessorySize.width);
  const top = point.y - accessorySize.height / 2;

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.heroSideAccessoryLayer]}
    >
      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setAccessorySize((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }}
        pointerEvents="box-none"
        style={[styles.heroSideAccessory, { left, top }]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  communityInTable: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  screen: { flex: 1 },
  content: { alignSelf: "center", flex: 1, width: "100%", zIndex: 1 },
  tableRegion: { flex: 1, minHeight: 272 },
  // Landscape: the room runs under the whole screen and the side columns sit over its corners.
  tableRegionLandscape: { minHeight: 0 },
  bottomBand: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    position: "absolute",
  },
  sideColumn: { maxWidth: "36%" },
  wordBuilderColumn: { marginBottom: 20, maxWidth: "42%" },
  bettingColumn: { maxWidth: "32%" },
  tableRegionCompact: { minHeight: 234 },
  // A small phone: the felt is narrower than the screen, so the height it keeps goes to the word.
  table: { backgroundColor: "transparent", flex: 1 },
  waiting: bettingRowStyle,
  bettingCloser: { marginTop: -6 },
  // The wager button's artwork has transparent room above its housing; the rack sits into it.
  bettingTucked: { marginTop: -8 },
  rackActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 2,
  },
  // Above the targeting scrim so the same card still toggles and cancels while choosing.
  heroSideAccessoryLayer: { zIndex: 21 },
  heroSideAccessory: { position: "absolute" },
});
