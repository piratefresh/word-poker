import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useReducedMotion,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Mask,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import {
  hangsModeTag,
  Hud,
  TurnClockProvider,
  useHudChromeHeight,
  type BalanceView,
} from "@/components/hud";
import { MODE_TAG_BLOCK } from "@/components/hud/top-bar/banner";
import {
  ChipLayer,
  PokerTable,
  useTableLayout,
  type NormPoint,
} from "@/components/table";
import { CoachTarget } from "@/components/ui/coach";

import { TableBackdrop } from "./backdrop";
import { CoinBowlGameContext } from "./backdrop/coin-bowl-motion";
import { FeltMat } from "./backdrop/felt-mat";
import { matBox } from "./backdrop/felt-mat-box";
import {
  BettingControls,
  bettingRowStyle,
  RaiseSlider,
  useRaiseAmount,
} from "./betting";
import type { GamePlayer, GameScreenState, LetterTileData } from "./game-types";
import {
  BestWord,
  CommunityStrip,
  PlayerRack,
  PlayerSeat,
  Pot,
} from "./primitives";
import { HOLDER } from "@/components/word-builder/rack-holder-box";
import { rackFor } from "@/components/word-builder/strip";

import {
  landscapeFrame,
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
  /** Drawn over the whole screen, above the HUD, rack and betting row: the Power Draw. */
  modal?: ReactNode;
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
  modal,
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
  // In landscape (mock 1a) the table takes the top of the screen with the hero's seat on its bottom
  // edge, and one row under it holds the word on the left thumb and the betting on the right.
  const landscape = window.width > window.height;
  // The same inset on both sides, whichever side the island is on, so a rotation never shifts it.
  const hand = rackFor(window);
  const frame = landscapeFrame(window, insets, hand.itemHeight);
  const side = landscape ? frame.side : 0;
  const scale = useScreenScale();
  const tight = useCompactControls();
  const [controlsHeight, setControlsHeight] = useState(0);
  // The word builder's height at the top of the controls: the mat ends where it does. A height,
  // not the betting row's `y` — the web's onLayout fires on a resize, not a move.
  const [rackHeight, setRackHeight] = useState<number | null>(null);
  // The betting slot's tallest face at this window size: the submit and waiting rows stand in
  // the wager row's box, so the felt keeps one height through the hand instead of growing when
  // the round CHECK button gives way to the shorter SUBMIT WORD bar.
  const windowKey = `${window.width}x${window.height}`;
  const [bettingFloor, setBettingFloor] = useState({ key: "", height: 0 });
  const bettingMinHeight =
    bettingFloor.key === windowKey ? bettingFloor.height : 0;
  // Portrait's controls reach into the home indicator's band: half of it stays clear for the
  // swipe, the rest goes to the felt instead of standing empty under the action row.
  const bottomInset = landscape ? insets.bottom : Math.round(insets.bottom / 2);
  // Landscape's table is the frame's box: 6 under the top, the HUD's corners inside it.
  const tableTop = landscape ? frame.tableTop : insets.top + hudHeight + 6;
  const tableHeight = landscape
    ? frame.tableHeight
    : height - insets.top - bottomInset - hudHeight - controlsHeight;
  // Short phones need extra clearance for the deeper two-slot tabletop rack.
  const roomChromeWidth = Math.max(
    tight ? 220 : 240,
    tableHeight * (400 / (tight ? 540 : 470)),
  );
  const chromeWidth = Math.min(
    tableMaxWidth(window) ?? window.width,
    roomChromeWidth,
  );
  const compact = height - insets.top - insets.bottom < 690;
  // Landscape's short felt sizes the seats down to 0.6; the nameplates and status tags grow back
  // toward portrait's reading size; the avatars grow with them and may overflow the felt.
  const labelScale = landscape ? 1.5 : 1;
  const [raiseAmount, changeRaise] = useRaiseAmount(
    game.betting,
    onRaiseAmountChange,
    game.id,
  );
  // Keyed to the turn, so every new turn starts collapsed.
  const [raiseOpenFor, setRaiseOpenFor] = useState<string | null>(null);
  const raiseOpen = raiseOpenFor === game.id;
  const [raiseAnchor, setRaiseAnchor] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const setRaiseOpen = useCallback(
    (open: boolean) => setRaiseOpenFor(open ? game.id : null),
    [game.id],
  );
  const view = useHandTurn(game, clockHeld);

  // Who the wager button waits on: the seat wearing "thinking" is the one acting. The hero
  // keeps the live face on their own turn — illegal actions included, which stay disabled —
  // and through §19's word window, which arms the confirm while it is nobody's acting turn:
  // that wait is the hero's own. No acting seat (between streets, payout) is a wait with no
  // name and no clock to drain.
  const actingSeat =
    game.players.find((player) => player?.status === "thinking") ?? null;
  const heroActing =
    !waiting &&
    game.players.find((player) => player?.isHero)?.status === "your-turn";
  const rowIsHeros = heroActing || game.betting.primary === "confirm";

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
      ? // The board a little above the middle and the pot one line under it, clear of the hero's
        // seat on the table's bottom edge.
        { communityY: 0.56, potY: 0.7 }
      : {};
    if (!landscape || (game.seatCount !== 2 && game.seatCount !== 4)) {
      return { ...seating.layoutConfig, ...landscapeLayout };
    }
    const seatAngles = [...(seating.layoutConfig.seatAngles ?? [])];
    seatAngles[game.seatCount === 2 ? 1 : 2] = 1.5 * Math.PI;
    return { ...seating.layoutConfig, ...landscapeLayout, seatAngles };
  }, [game.seatCount, landscape, seating]);
  // In landscape the hero's seat sits on the table's bottom edge, its labels beside the avatar and
  // the pair centred; at two and four seats the top opponent sits just under the HUD and the side
  // ones close beside it, a little lower, so the three read as one row.
  const heroSeat = seatMetrics(chromeWidth, true, labelScale);
  const contentWidth = window.width - 2 * side;
  const seatPositionOverrides = useMemo((): Record<number, Partial<NormPoint>> | undefined => {
    if (!landscape) return undefined;
    const hero = {
      // The hero stands in the right corner over fold, call and raise: its labels run to the
      // avatar's right, so the avatar sits one label's width plus its own radius from the edge.
      x:
        1 -
        (heroSeat.avatar / 2 + heroSeat.besideGap + heroSeat.width + 8) /
          Math.max(1, contentWidth),
      y: 1,
    };
    if (game.seatCount === 2) return { 0: hero, 1: { y: 0.14 } };
    if (game.seatCount === 4) {
      return {
        0: hero,
        1: { x: 0.28, y: 0.22 },
        2: { y: 0.14 },
        3: { x: 0.72, y: 0.2 },
      };
    }
    return { 0: hero };
  }, [game.seatCount, landscape, heroSeat, contentWidth]);

  // Keep the mode under the capsule in portrait; the table reserves its clearance below.
  const modeTag = hangsModeTag(balance, window);

  // The rail's foot: the controls' bottom, up past the choice chips' row that the strip keeps under
  // its tiles, down by the strip's own drop (`stripTight`) and the ledge below the tiles.
  const landscapeMatBottom =
    height - frame.bottom - 6 - (hand.height - hand.itemHeight) + 6 + HOLDER.ledge;

  const rackBlock = (
    <>
      <BestWord
        payout={game.phase === "payout"}
        score={game.bestScore}
        word={game.bestWord}
      />
      <CoachTarget id="rack" testID="game-rack">
        {rack ?? (
          <PlayerRack
            community={game.community}
            privateTiles={game.privateTiles}
          />
        )}
        {rackActions == null || waiting ? null : (
          <View style={styles.rackActions} testID="word-builder-actions">
            {rackActions}
          </View>
        )}
      </CoachTarget>
    </>
  );
  const bettingBlock = (
    // Pulled up over the rack's action row (`bettingCloser`), so its empty room must pass taps
    // through to Validate Word and Shuffle beneath it; only its own controls take them.
    <View
      pointerEvents="box-none"
      onLayout={
        landscape
          ? undefined
          : (event: LayoutChangeEvent) => {
              const measured = event.nativeEvent.layout.height;
              setBettingFloor((floor) =>
                floor.key === windowKey && floor.height >= measured
                  ? floor
                  : { key: windowKey, height: measured },
              );
            }
      }
      style={[
        !waiting &&
          !landscape &&
          (rackActions != null ? styles.bettingCloser : styles.bettingTucked),
        !landscape && { justifyContent: "center", minHeight: bettingMinHeight },
        // On its side the row centres on the rack's tiles: a tile tall, raised past the strip's
        // chip row under them and the 6 its tiles sit low (`stripTight`).
        landscape &&
          !waiting && {
            height: hand.itemHeight,
            justifyContent: "center",
            marginBottom: hand.height - hand.itemHeight - 6,
          },
      ]}
      testID={waiting ? "waiting-controls" : "betting-controls"}
    >
      {waiting ? (
        <View style={styles.waiting}>{waiting.controls}</View>
      ) : (
        <BettingControls
          amount={raiseAmount}
          locked={actionsLocked}
          waitingOn={
            rowIsHeros
              ? undefined
              : { name: actingSeat?.name, view: actingSeat ? view : undefined }
          }
          onAllIn={onAllIn}
          onRaiseAnchor={setRaiseAnchor}
          onRaiseOpenChange={setRaiseOpen}
          raiseOpen={raiseOpen}
          onCheckOrCall={onCheckOrCall}
          onFold={onFold}
          onWager={commitWager ? () => commitWager(raiseAmount) : undefined}
          state={game.betting}
          submission={game.wordSubmission}
          timer={view}
        />
      )}
    </View>
  );

  return (
    <LinearGradient
      colors={["#0a1d17", "#051410"]}
      style={styles.screen}
      testID="game-screen"
    >
      {/* The backdrop's coin bowl and the pot bowl both play the table's turns. */}
      <CoinBowlGameContext.Provider value={game}>
        <TableBackdrop />
        {/* The mat starts under the HUD and its hanging mode tag, so the opponents sit on it. On
          its side it runs down to the foot of the word builder's rail, so the tiles and the table
          share the one mat; the hero's seat still straddles the table's own bottom edge. */}
        {landscape ? (
          <FeltMat
            box={{
              x: side,
              y: tableTop,
              width: window.width - 2 * side,
              height: landscapeMatBottom - tableTop,
            }}
            height={height}
            width={window.width}
          />
        ) : (
          <FeltMat
            box={matBox(
              window,
              insets.top + hudHeight + (modeTag ? MODE_TAG_BLOCK : 0) + 4,
              rackHeight == null
                ? undefined
                : height - bottomInset - controlsHeight + rackHeight,
            )}
            height={height}
            width={window.width}
          />
        )}
        {/* Under the content layer, so it lights the betting row's band and stops where the word
          builder ends rather than washing over the tiles. */}
        {!landscape && rackHeight != null && heroActing ? (
          <TurnGlow height={Math.min(340, controlsHeight - rackHeight)} />
        ) : null}
        {/* On its side the row is one band at the foot: the glow rises from the screen's bottom
          edge behind it, the rail and the betting buttons both. */}
        {landscape && heroActing ? <TurnGlow height={hand.itemHeight + 40} /> : null}
        {/* Above the HUD, so the community label reads over the timer banner's hanging tip; the
          layer takes no touches of its own, so the HUD's buttons stay pressable. */}
        <View
          pointerEvents="box-none"
          style={[
            styles.content,
            {
              maxWidth: landscape ? undefined : stageWidth,
              // paddingBottom: bottomInset,
              paddingLeft: side,
              paddingRight: side,
              paddingTop: landscape ? tableTop : insets.top + hudHeight,
            },
          ]}
        >
          <CoachTarget
            id="table"
            style={[
              // Landscape's region is its own style, not an override of the portrait one: a `flex: 1`
              // underneath beats a longhand `flexBasis` on iOS, and `flex: 0` is a 0% basis on web.
              landscape ? { height: tableHeight } : styles.tableRegion,
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
                    // Landscape's board gives back the room the smaller avatars free: 1.1 of the tile.
                    scale={landscape ? scale * 1.1 : scale}
                    tiles={game.community}
                    beside={
                      landscape && !hidePot ? (
                        <Pot
                          amount={game.pot}
                          sidePots={game.sidePots}
                          blinds={game.blinds}
                          beside
                          tableWidth={chromeWidth}
                          tabletop
                        />
                      ) : undefined
                    }
                  />
                  <ChipLayer
                    flights={game.flights}
                    onFlightEnd={onChipFlightEnd}
                  />
                  {heroSideAccessory == null ? null : (
                    <HeroSeatAccessory
                      avatarSize={seatMetrics(chromeWidth, true, labelScale).avatar}
                      gap={8 * scale}
                      heroSeatIndex={game.players.findIndex(
                        (player) => player?.isHero,
                      )}
                    >
                      {heroSideAccessory}
                    </HeroSeatAccessory>
                  )}
                </>
              }
              overlay={overFelt}
              // The table runs to the room's edges.
              chromeInset={0}
              layoutConfig={layoutConfig}
              renderCommunity={() => null}
              renderPot={({ size, appearanceWidth }) =>
                hidePot || landscape ? null : (
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
                <PlayerSeat
                  {...slot}
                  dealt={!waiting}
                  direction={landscape && slot.seat?.isHero ? "right" : undefined}
                  onPress={onSeatPress}
                  pill={landscape && slot.seat?.isHero === true}
                  labelScale={labelScale}
                  tabletop
                  turnProgress={waiting ? undefined : view.elapsedFraction}
                />
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
          {/* A tap anywhere off the slider closes it; it sits under the controls, so those still act. */}
          {raiseOpen && !waiting ? (
            <Pressable
              accessible={false}
              onPress={() => setRaiseOpen(false)}
              style={StyleSheet.absoluteFill}
              testID="wager-slider-dismiss"
            />
          ) : null}
          {landscape ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.landscapeControls,
                { bottom: frame.bottom + 6, left: side, right: side },
              ]}
              testID="game-controls"
            >
              {/* The word builder spans the whole row, so its rail is centred on the screen and the
                betting buttons, drawn after it, lie over its empty right-hand side. */}
              <View pointerEvents="box-none" style={styles.landscapeRack}>
                {rackBlock}
              </View>
              {bettingBlock}
            </View>
          ) : (
            <View
              testID="game-controls"
              onLayout={(event: LayoutChangeEvent) =>
                setControlsHeight(event.nativeEvent.layout.height)
              }
            >
              <View
                onLayout={(event: LayoutChangeEvent) =>
                  setRackHeight(event.nativeEvent.layout.height)
                }
              >
                {rackBlock}
              </View>
              {bettingBlock}
            </View>
          )}
          {/* The wager slider floats over the table, not beside it: it never resizes the felt, and comes after the controls so it paints and hit-tests above them. */}
          {waiting ? null : (
            <View
              pointerEvents="box-none"
              style={{
                // The tube stands on the raise button, centred over it; the pills hang to its right.
                bottom: raiseAnchor
                  ? window.height - raiseAnchor.y + 16
                  : bottomInset + controlsHeight,
                left: raiseAnchor
                  ? Math.min(
                      raiseAnchor.x + raiseAnchor.width / 2 - 18,
                      window.width - 8 - RAISE_PILL_REACH,
                    )
                  : window.width - 24 - RAISE_PILL_REACH,
                position: "absolute",
              }}
            >
              <RaiseSlider
                amount={raiseAmount}
                onAmountChange={changeRaise}
                open={raiseOpen}
                pot={game.pot}
                state={game.betting}
                // On its side the screen is too short for the full tube: it stops under the help
                // disc in the table's corner (8 in, 32 across), its amount tag included.
                tubeHeight={
                  landscape && raiseAnchor
                    ? Math.min(300, raiseAnchor.y - 16 - tableTop - 8 - 32 - 4 - 30)
                    : undefined
                }
              />
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
          stamp={
            waiting?.stamp ?? (game.wordSubmission ? "FINAL STAGE" : undefined)
          }
          style={{ top: insets.top }}
          turn={waiting ? null : view}
          turnPhrase={
            game.wordSubmission
              ? "Word submission deadline"
              : heroTurnPhrase(game)
          }
          testID="game-hud"
        />
        {modal ? (
          <View
            pointerEvents="box-none"
            style={styles.modalLayer}
            testID="game-modal-layer"
          >
            {modal}
          </View>
        ) : null}
      </CoinBowlGameContext.Provider>
    </LinearGradient>
  );
}

/**
 * The warm band behind the action row while the hero acts. Decoration only — the live buttons
 * say whose turn it is — so it takes no touches and holds still under reduced motion.
 */
function TurnGlow({ height }: { height: number }) {
  const reduceMotion = useReducedMotion();
  // The mock's edge light is drawn for a 340px glow; a shorter box keeps its proportions, so the
  // hot edge doesn't swallow it.
  const line = Math.max(1, (3 * height) / 340);
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      style={[styles.turnGlow, { height }]}
      testID="turn-glow"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          reduceMotion ? { opacity: 0.3 } : TURN_GLOW_PULSE,
        ]}
      >
        {/* SVG for the mask: the top fades out, so the glow has no edge where it stops. */}
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient cx="0.5" cy="1" id="turnGlowFill" r="1">
              <Stop offset="0" stopColor="#fff0a8" />
              <Stop offset="0.22" stopColor="#ffd650" stopOpacity={0.95} />
              <Stop offset="0.5" stopColor="#ffbe32" stopOpacity={0.6} />
              <Stop offset="0.85" stopColor="#ffbe32" stopOpacity={0} />
            </RadialGradient>
            {/* The inset shadow: a light band up the bottom ~12% (42 of the mock's 340px). */}
            <SvgLinearGradient id="turnGlowEdge" x1="0" x2="0" y1="1" y2="0">
              <Stop offset="0" stopColor="#fff6c8" />
              <Stop
                offset={42 / 340}
                stopColor="#fff6c8"
                stopOpacity={0}
              />
            </SvgLinearGradient>
            <SvgLinearGradient id="turnGlowFade" x1="0" x2="0" y1="1" y2="0">
              <Stop offset="0.35" stopColor="#fff" />
              <Stop offset="1" stopColor="#fff" stopOpacity={0} />
            </SvgLinearGradient>
            <Mask id="turnGlowMask">
              <Rect fill="url(#turnGlowFade)" height="100%" width="100%" />
            </Mask>
          </Defs>
          <G mask="url(#turnGlowMask)">
            <Rect fill="url(#turnGlowFill)" height="100%" width="100%" />
            <Rect fill="url(#turnGlowEdge)" height="100%" width="100%" />
            <Rect fill="#fff" height={line} width="100%" y={height - line} />
          </G>
        </Svg>
      </Animated.View>
    </Animated.View>
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
  beside,
}: {
  tiles: GameScreenState["community"];
  scale: number;
  onPick?: (tile: LetterTileData) => void;
  /** Landscape's pot, hung under the board. */
  beside?: ReactNode;
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
        <View>
          <CommunityStrip inTable onPick={onPick} scale={scale} tiles={tiles} />
          {beside ? (
            <View pointerEvents="none" style={styles.besideBoard}>
              {beside}
            </View>
          ) : null}
        </View>
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
  const left = Math.max(
    0,
    point.x - avatarSize / 2 - gap - accessorySize.width,
  );
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

/** How far the preset pills reach right of the tube's left edge. */
const RAISE_PILL_REACH = 109;

// Outside StyleSheet.create: the web build validates its keys and rejects Reanimated's CSS animation.
const TURN_GLOW_PULSE = {
  animationDuration: "1.6s",
  animationIterationCount: "infinite",
  animationName: {
    "0%": { opacity: 0.25 },
    "50%": { opacity: 0.35 },
    "100%": { opacity: 0.25 },
  },
  animationTimingFunction: "ease-in-out",
} as const;

const styles = StyleSheet.create({
  besideBoard: { alignItems: "center", left: 0, marginTop: 4, position: "absolute", right: 0, top: "100%" },
  communityInTable: {
    alignItems: "center",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  screen: { flex: 1 },
  modalLayer: { ...StyleSheet.absoluteFill, elevation: 40, zIndex: 40 },
  content: { alignSelf: "center", flex: 1, width: "100%", zIndex: 1 },
  turnGlow: { bottom: 0, left: 0, position: "absolute", right: 0 },
  tableRegion: { flex: 1, minHeight: 272 },
  // The row on the foot: word on the left, betting on the right, the gap between them whatever
  // the width leaves. Pinned 6 over the bottom inset, so its tiles' top is the frame's line `A`.
  landscapeControls: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "flex-end",
    position: "absolute",
  },
  landscapeRack: { bottom: 0, left: 0, position: "absolute", right: 0 },
  tableRegionCompact: { minHeight: 234 },
  // A small phone: the felt is narrower than the screen, so the height it keeps goes to the word.
  table: { backgroundColor: "transparent", flex: 1 },
  waiting: bettingRowStyle,
  // The wager slider floats over the felt, so the rack can sit closer to the betting row.
  bettingCloser: { marginTop: -50 },
  // The wager button's artwork has transparent room above its housing; the rack sits into it.
  bettingTucked: { marginTop: -8 },
  rackActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 0,
  },
  // Above the targeting scrim so the same card still toggles and cancels while choosing.
  heroSideAccessoryLayer: { zIndex: 21 },
  heroSideAccessory: { position: "absolute" },
});
