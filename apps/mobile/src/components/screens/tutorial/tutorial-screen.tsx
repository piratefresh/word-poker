import { Button, Host, Row } from "@expo/ui";
import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROUND_PHASES, type RoundPhase } from "@wordpoker/contracts";

import { Tile, type TileData, type TileSide } from "@/components/game";
import {
  HUD_CHROME_HEIGHT,
  Hud,
  TurnClockProvider,
  useToastQueue,
  useTurnClock,
  useTurnTimer,
} from "@/components/hud";
import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import {
  EmptyTile,
  PlayerSeat,
  Pot,
} from "@/components/screens/game/game-primitives";
import { DEVICE_CLOCK_SAMPLE, openTurn, type OpenTurn } from "@/components/screens/game/game-screen-hud";
import { PokerTable } from "@/components/table";
import {
  border,
  colors,
  duration,
  layout,
  radius,
  spacing,
  type,
} from "@/constants/theme";

const COMMUNITY_TILES: readonly TileData[] = [
  { id: "tutorial-community-ae", letter: "A", alternativeLetter: "E", points: 1 },
  { id: "tutorial-community-n", letter: "N", points: 2 },
  { id: "tutorial-community-o", letter: "O", points: 1 },
  { id: "tutorial-community-t", letter: "T", points: 1 },
  { id: "tutorial-community-s", letter: "S", points: 1 },
];

const COMMUNITY_TILE_SIZE = 34;
const DEAL_STAGGER_MS = 130;
const SETTLE_AFTER_LAST_FLIP_MS = duration.deal + 80;

/** No wallet is wired into the lesson yet, so the HUD says so instead of painting `$0`. */
const BALANCE_UNAVAILABLE = { state: "unavailable" } as const;

/**
 * What the deal button just put on the felt, for the action toast. Total over the phases
 * so that adding one forces a decision here rather than silently reusing a neighbour's
 * wording.
 */
const DEAL_TOAST: Record<RoundPhase, string> = {
  preflop: "Board cleared",
  flop: "Flop dealt",
  turn: "Turn dealt",
  river: "River dealt",
  payout: "Hand complete",
};

/** How long each round's clock holds — and counts, once continued — in ms. */
const LESSON_ROUND_MS = 30_000;

/**
 * The lesson's round clock: which street it is on, which hand (payout rolls into a
 * fresh one), and whether the street's budget is held or counting. Held is the resting
 * state — the walkthrough explains each street with the clock frozen at its budget.
 * `phaseIndex` is total over ROUND_PHASES: `firstLessonRound` starts at 0 and
 * `advanceLessonRound` wraps past the last.
 */
export interface LessonRound {
  hand: number;
  phaseIndex: number;
  running: boolean;
}

/** The first hand's first street, held — where the lesson starts on mount. */
export function firstLessonRound(): LessonRound {
  return { hand: 1, phaseIndex: 0, running: false };
}

/**
 * The next round after a spent one: the next street, held; payout was the last, so it
 * rolls into a fresh hand's first street. Pure, so the machine is unit-testable with
 * no clock and no tree.
 */
export function advanceLessonRound(round: LessonRound): LessonRound {
  if (round.phaseIndex + 1 >= ROUND_PHASES.length) {
    return { hand: round.hand + 1, phaseIndex: 0, running: false };
  }
  return { hand: round.hand, phaseIndex: round.phaseIndex + 1, running: false };
}

/**
 * The lesson's round as a turn for the HUD clock. A held round freezes at its budget —
 * `pausedAtMs` pins the countdown there, the same pin the HUD clock's tests prove; a
 * running one anchors the budget exactly once, through the same `openTurn` convention
 * the game screen anchors with. The key names the round it came from: continuing
 * (held → running) and advancing (a new street or hand) are fresh turns, and a
 * re-render of the same round is not.
 */
export function openLessonTurn(round: LessonRound, nowMs: number): OpenTurn {
  const anchor = `${round.hand}-${ROUND_PHASES[round.phaseIndex]}`;
  if (round.running) {
    return openTurn(
      { id: `run-${anchor}`, secondsRemaining: LESSON_ROUND_MS / 1000 },
      nowMs,
    );
  }
  return {
    key: `hold-${anchor}`,
    timing: {
      startedAtMs: nowMs,
      endsAtMs: nowMs + LESSON_ROUND_MS,
      pausedAtMs: nowMs,
    },
  };
}

/**
 * Placeholder for the first-run lesson. The hand walkthrough and the starting chip
 * grant land here later; the real table renders now so the lesson has its final
 * surface to be written against.
 *
 * The lesson is deliberately serverless: onboarding is scripted and deterministic, so
 * it must not inherit a connecting/error surface or break when the server is down.
 * The in-hand HUD is mounted against the device-timeline clock (the provider below)
 * and a local held-round machine paces it — each street arms with its budget frozen,
 * Continue runs it down, expiry rolls the next street. The felt's deal flow stays
 * manual until the lesson content lands.
 */
export function TutorialScreen() {
  return (
    <TurnClockProvider sample={DEVICE_CLOCK_SAMPLE}>
      <TutorialScreenBody />
    </TurnClockProvider>
  );
}

/** The body reads the clock, so it has to sit inside the provider rather than beside it. */
function TutorialScreenBody() {
  const insets = useSafeAreaInsets();
  const [handSide, setHandSide] = useState<TileSide>("back");
  const [dealtCount, setDealtCount] = useState(0);
  const [isDealing, setIsDealing] = useState(false);
  const dealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const queue = useToastQueue();
  const handIsVisible = handSide === "front";
  const phase = communityPhase(dealtCount);

  const clearDealTimers = () => {
    dealTimers.current.forEach(clearTimeout);
    dealTimers.current = [];
  };

  useEffect(
    () => () => {
      dealTimers.current.forEach(clearTimeout);
    },
    [],
  );

  const resetCommunity = () => {
    clearDealTimers();
    setIsDealing(false);
    setDealtCount(0);
    queue.push({ key: "deal", severity: "info", message: DEAL_TOAST.preflop });
  };

  const dealCommunity = () => {
    if (isDealing) return;
    if (dealtCount >= COMMUNITY_TILES.length) {
      resetCommunity();
      return;
    }

    clearDealTimers();
    setIsDealing(true);
    const target = dealtCount < 3 ? 3 : dealtCount + 1;
    const cardsToDeal = target - dealtCount;
    // One key for every deal, so dealing again replaces the report instead of stacking a
    // column of stale ones over the felt.
    queue.push({ key: "deal", severity: "info", message: DEAL_TOAST[communityPhase(target)] });

    for (let offset = 0; offset < cardsToDeal; offset += 1) {
      const nextCount = dealtCount + offset + 1;
      const mountDelay = offset * DEAL_STAGGER_MS;
      dealTimers.current.push(
        setTimeout(() => setDealtCount(nextCount), mountDelay),
      );
    }

    const lastMountDelay = (cardsToDeal - 1) * DEAL_STAGGER_MS;
    dealTimers.current.push(
      setTimeout(() => {
        setIsDealing(false);
        dealTimers.current = [];
      }, lastMountDelay + SETTLE_AFTER_LAST_FLIP_MS),
    );
  };

  const { nowMs } = useTurnClock();
  const [round, setRound] = useState<LessonRound>(firstLessonRound);
  // Hold-once semantics, as the game screen: the running budget anchors at the render
  // that first sees the round. Re-deriving per render would push the deadline forward
  // with each one and the countdown would stand still.
  const roundTurn = openLessonTurn(round, nowMs);
  const [turn, setTurn] = useState(() => openLessonTurn(round, nowMs));
  if (turn.key !== roundTurn.key) setTurn(roundTurn);
  const turnView = useTurnTimer(turn.timing);

  // Expiry advances the lesson: the next street arms held, so the clock freezes again
  // on the render after the budget runs out. Only a running turn can expire — a held
  // one pins to its budget — so the running guard is the machine's own invariant.
  useEffect(() => {
    if (!round.running || !turnView.expired) return;
    setRound(advanceLessonRound(round));
  }, [round, turnView.expired]);

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: insets.top + HUD_CHROME_HEIGHT,
          paddingBottom: insets.bottom + spacing.xl,
        },
      ]}>
      <View style={styles.body}>
        <Host colorScheme="dark" matchContents seedColor={colors.gold}>
          <Row alignment="center" spacing={spacing.sm}>
            <Button
              disabled={isDealing}
              label={communityActionLabel(dealtCount, isDealing)}
              onPress={dealCommunity}
              variant="filled"
            />
            <Button
              disabled={dealtCount === 0 && !isDealing}
              label="Reset board"
              onPress={resetCommunity}
              variant="text"
            />
            <Button
              disabled={round.running}
              label="Continue"
              onPress={() => setRound((current) => ({ ...current, running: true }))}
              variant="text"
            />
          </Row>
        </Host>
      </View>

      {/*
        The board owns its own strip above the felt, the same place the game screen deals
        it, and the felt is left to the seats and the pot. The tiles are the count: the
        action button already names the street it is about to deal, so the lesson needs
        no separate counter.
      */}
      <View accessibilityLabel="Community board" style={styles.communityRow}>
        {COMMUNITY_TILES.map((tile, index) =>
          index < dealtCount ? (
            <Tile
              animation="deal"
              key={tile.id}
              ownership="community"
              side="front"
              size="small"
              testID={`tutorial-community-tile-${tile.id}`}
              tile={tile}
            />
          ) : (
            <EmptyTile key={tile.id} size={COMMUNITY_TILE_SIZE} />
          ),
        )}
      </View>

      <View style={styles.tableRegion}>
        <PokerTable
          chromeInset={42}
          community={[]}
          layoutConfig={{ seatRadius: { x: 0.98, y: 0.96 }, potY: 0.5 }}
          railWidth={3}
          renderCommunity={() => null}
          renderPot={() => <Pot amount={FOUR_PLAYER_FLOP_FIXTURE.pot} />}
          renderSeat={PlayerSeat}
          seatCount={FOUR_PLAYER_FLOP_FIXTURE.seatCount}
          seats={FOUR_PLAYER_FLOP_FIXTURE.players}
          style={styles.table}
          testID="tutorial-poker-table"
        />
      </View>

      <View accessibilityLabel="Your private hand" style={styles.handDock}>
        <View style={styles.handHeading}>
          <View>
            <Text style={styles.handKicker}>YOUR HAND</Text>
            <Text style={styles.handHint}>Private tiles only you can see</Text>
          </View>
          <Host
            colorScheme="dark"
            matchContents
            seedColor={colors.gold}
            style={styles.revealHost}>
            <Button
              label={handIsVisible ? "Hide" : "Reveal"}
              onPress={() => setHandSide(handIsVisible ? "back" : "front")}
              variant="text"
            />
          </Host>
        </View>

        <View style={styles.handTiles}>
          {FOUR_PLAYER_FLOP_FIXTURE.privateTiles.map((tile, index) => (
            <Tile
              animation="flip"
              key={tile.id}
              ownership="private"
              selected={handIsVisible && index === 0}
              side={handSide}
              size="large"
              testID={`tutorial-hand-tile-${tile.id}`}
              tile={tile}
            />
          ))}
        </View>
      </View>

      {/*
        Mounted last so it paints over the table, and positioned from the safe area rather
        than the parent's padding: it is screen chrome, not part of the lesson's column.
        The leave slot is the lesson's only way back — a second back control here would be
        a control the real game screen does not have, which is the opposite of a preview.
      */}
      <Hud
        balance={BALANCE_UNAVAILABLE}
        onHelp={() =>
          queue.push({
            key: "help",
            severity: "info",
            message: "The lesson is the help for now",
          })
        }
        onLeave={leave}
        onSettings={() =>
          queue.push({
            key: "settings",
            severity: "info",
            message: "Settings arrive with the game server",
          })
        }
        style={{ top: insets.top }}
        phase={phase}
        toastQueue={queue}
        turn={turnView}
      />
    </View>
  );
}

/** A deep link can land here with nothing behind it, so fall back to the picker. */
function leave() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/");
}

/**
 * How far the dealt board has come, as a hand phase.
 *
 * The lesson deals in the order a hand does, so the phase follows the count: nothing out
 * is pre-flop, the first three are the flop, and the last two come one at a time. Exported
 * because it is the lesson's model of a hand, and the HUD's label is only ever as right as
 * this mapping.
 */
export function communityPhase(dealtCount: number): RoundPhase {
  if (dealtCount >= 5) return "river";
  if (dealtCount >= 4) return "turn";
  if (dealtCount >= 1) return "flop";
  return "preflop";
}

function communityActionLabel(dealtCount: number, isDealing: boolean) {
  if (isDealing) return "Dealing…";
  if (dealtCount < 3) return "Deal flop";
  if (dealtCount === 3) return "Deal turn";
  if (dealtCount === 4) return "Deal river";
  return "Replay board";
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.bg,
    flex: 1,
  },
  body: {
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.lg,
  },
  /* The board's own strip, above the felt. Centered rather than stretched, because a row
     of five tiles is narrower than the table it sits over. */
  communityRow: {
    alignItems: "center",
    borderBottomColor: colors.borderFaint,
    borderBottomWidth: border.hairline,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "center",
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  /* PokerTable measures itself, so the region must bound a real height. It
     spans the full width like the game screen does, so the seats sitting on
     the felt edge are never clipped by the screen gutter. */
  tableRegion: {
    flex: 1,
    minHeight: 260,
    marginBottom: -spacing.lg,
    paddingHorizontal: spacing.sm,
    width: "100%",
  },
  table: {
    backgroundColor: "transparent",
  },
  handDock: {
    alignSelf: "center",
    backgroundColor: "rgba(2,10,7,0.94)",
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    flexDirection: "row",
    gap: spacing.lg,
    marginHorizontal: spacing.gutter,
    maxWidth: layout.maxContentWidth,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    width: "90%",
  },
  handHeading: {
    flex: 1,
    justifyContent: "space-between",
    minWidth: 100,
  },
  handKicker: {
    ...type.kicker,
    color: colors.goldHi,
  },
  handHint: {
    ...type.bodyDim,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  handTiles: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  revealHost: {
    alignSelf: "flex-start",
  },
});
