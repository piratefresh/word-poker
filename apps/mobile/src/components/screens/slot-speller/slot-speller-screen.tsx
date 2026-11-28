import { BottomSheet, RNHostView } from "@expo/ui";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  canHold,
  holdLimit,
  type Dictionary,
  type SlotEvaluation,
  type SlotPhase,
  type SlotSpellerState,
  type SlotWord,
} from "@wordpoker/game-rules";

import { palette, spacing } from "@/constants/theme";
import {
  payBeat,
  payoutRows,
  randomSlotSeed,
} from "@/features/slot-speller/slot-speller-model";
import { useSlotRecords } from "@/features/slot-speller/slot-speller-save";
import {
  useSlotSpeller,
  type SlotSpeller,
} from "@/features/slot-speller/use-slot-speller";
import { useDictionary } from "@/features/table/use-dictionary";

import {
  ARTBOARD,
  landscapeLayout,
  portraitLayout,
  SlotDeck,
  SlotHeader,
  SlotHint,
  SlotPanel,
  SlotPlaques,
  SlotPowerShelf,
  type CabinetLayout,
  type SlotDeckProps,
} from "./slot-cabinet";
import { cellCentre, lineColour, SlotCellKey, SlotGrid } from "./slot-grid";
import { SlotPayoutList } from "./slot-payout-list";
import { SlotPayoutSheet, SlotRoundSheet } from "./slot-round-sheet";
import {
  SlotLineChips,
  SlotPowersPanel,
  SlotRecordsBlock,
  SlotSeedRow,
} from "./slot-run-info";

/** G1 · Glossy reels: the cabinet frame, header buttons, meter, plaques, deck and shelf, painted. */
const CABINET_ART = require("../../../../assets/images/slot-speller/glossy-reels.jpg");
/** The painted art's top edge: the screen behind a stage shorter than the device. */
const CABINET_GROUND = "#2e432d";
/** The header's top on the artboard; it stays clear of the status bar. */
const HEADER_TOP = 71;

export interface SlotSpellerScreenProps {
  /** A saved run to resume (persistence hangs off this and `onChange`). */
  initialState?: SlotSpellerState;
  onChange?: (state: SlotSpellerState, previous: SlotSpellerState) => void;
}

/** The reels a run starts with, for the loading stage. */
const ARTBOARD_REELS = 5;
/** The most reels the portrait cabinet holds; past this the screen turns to landscape. */
const PORTRAIT_MAX_REELS = 8;

/**
 * Whether the run wants landscape: past eight reels. It follows the reels outside the shop only,
 * so buying a ninth reel turns the screen once the shop closes, not under the open sheet. On a
 * phone the screen is locked to match; the web follows the window.
 */
function useLandscape(state: SlotSpellerState | null): boolean {
  const wants = state !== null && state.reels > PORTRAIT_MAX_REELS;
  const [landscape, setLandscape] = useState(wants);
  if (landscape !== wants && state?.phase !== "shop") setLandscape(wants);
  useEffect(() => {
    if (Platform.OS === "web") return;
    void ScreenOrientation.lockAsync(
      landscape ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  }, [landscape]);
  useEffect(
    () => () => {
      if (Platform.OS !== "web") void ScreenOrientation.unlockAsync();
    },
    [],
  );
  return landscape;
}

/** The stage: the whole screen, and where every piece of the cabinet sits on it. */
interface Stage {
  left: number;
  top: number;
  width: number;
  height: number;
  layout: CabinetLayout;
}

/**
 * Portrait: the 390 × 844 artboard scaled to fit the device, centred across, sat on the bottom edge
 * (the power shelf runs down to it), and its header kept clear of the status bar. Landscape (wanted,
 * and the window is wider than tall): the whole screen, the controls in a column on the left.
 */
function useStage(landscape: boolean, reels: number): Stage {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (landscape && width > height) {
    return { left: 0, top: 0, width, height, layout: landscapeLayout(width, height, insets, reels) };
  }
  const unit = Math.min(
    width / ARTBOARD.width,
    height / ARTBOARD.height,
    (height - insets.top - spacing.sm) / (ARTBOARD.height - HEADER_TOP),
  );
  return {
    left: (width - ARTBOARD.width * unit) / 2,
    top: height - ARTBOARD.height * unit,
    width: ARTBOARD.width * unit,
    height: ARTBOARD.height * unit,
    layout: portraitLayout(unit),
  };
}

const goBack = (): void =>
  router.canGoBack() ? router.back() : router.replace("/");

/** The cabinet at the stage's size: the painted art in portrait, the art blurred to a backdrop in landscape. */
function CabinetStage({
  stage,
  children,
}: {
  stage: Stage;
  children: ReactNode;
}): ReactElement {
  const { painted } = stage.layout;
  return (
    <View
      style={[
        styles.stage,
        {
          left: stage.left,
          top: stage.top,
          width: stage.width,
          height: stage.height,
        },
      ]}
    >
      <Image
        accessible={false}
        blurRadius={painted ? undefined : 24}
        contentFit={painted ? "fill" : "cover"}
        source={CABINET_ART}
        style={StyleSheet.absoluteFill}
      />
      {painted ? null : <View style={[StyleSheet.absoluteFill, styles.dim]} />}
      <SlotPanel layout={stage.layout} />
      {children}
    </View>
  );
}

/** Slot Speller (§48): one solo run on the engine, in-process, held until the dictionary loads. */
export function SlotSpellerScreen({
  initialState,
  onChange,
}: SlotSpellerScreenProps): ReactElement {
  const dictionary = useDictionary();
  const landscape = useLandscape(initialState ?? null);
  const stage = useStage(landscape, initialState?.reels ?? ARTBOARD_REELS);

  return (
    <View style={styles.screen}>
      {dictionary === null ? (
        <CabinetStage stage={stage}>
          <SlotHint layout={stage.layout}>Loading the reels…</SlotHint>
        </CabinetStage>
      ) : (
        <SlotSpellerTable
          dictionary={dictionary}
          initialState={initialState}
          onChange={onChange}
        />
      )}
    </View>
  );
}

interface SlotSpellerTableProps extends SlotSpellerScreenProps {
  dictionary: Dictionary;
}

function SlotSpellerTable({
  dictionary,
  initialState,
  onChange,
}: SlotSpellerTableProps): ReactElement {
  const game = useSlotSpeller({ dictionary, initialState, onChange });
  const stage = useStage(useLandscape(game.state), game.state.reels);
  const { layout } = stage;
  const { unit } = layout;
  const {
    state,
    payout,
    revealStep,
    preview,
    selected,
    held,
    revealing,
    dispatch,
  } = game;
  const records = useSlotRecords();
  const sheet = useRoundSheet(state, revealing);
  const [menuOpen, setMenuOpen] = useState(false);
  // The last spin whose reels have all landed; a newer spin is still rolling in.
  const [landedSpin, setLandedSpin] = useState(state.spinCount);
  const rolling = state.spinCount !== landedSpin;
  // The payout the sheet was opened for: a later pay or a new run never reopens it.
  const [payoutShown, setPayoutShown] = useState<SlotEvaluation | null>(null);
  const reduceMotion = useReducedMotion();
  const live = state.phase === "moving" && !rolling;
  const livePreview = live ? (preview?.total ?? 0) : 0;

  // The bars: the live preview while moving, the paid spin after a pay. The pay sequence and the
  // list both read the engine's payout, so all three totals are its `evaluate`.
  const beat = payout === null ? null : payBeat(payout, revealStep);
  const words = payout?.words ?? (live ? (preview?.words ?? []) : []);
  // The engine banks the whole payout at once; the meter fills word by word as the sequence pays.
  const meterScore =
    payout === null || beat === null ? state.roundScore : state.roundScore - payout.total + beat.paid;
  // A word's score flies to the meter on its beat (not on its powers' beats).
  const flyingIndex = beat !== null && beat.power === null && !reduceMotion ? beat.current : null;
  const flying = flyingIndex === null ? undefined : payout?.words[flyingIndex];

  const newRun = (seed: string): void => {
    setMenuOpen(false);
    dispatch({ type: "newRun", seed });
  };

  return (
    <>
      <CabinetStage stage={stage}>
        <SlotHeader
          layout={layout}
          state={state}
          score={meterScore}
          preview={livePreview}
          onPayout={payout !== null && !revealing ? () => setPayoutShown(payout) : undefined}
          onBack={goBack}
          onMenu={() => setMenuOpen(true)}
        />
        <SlotPlaques layout={layout} state={state} />
        <SlotGrid
          state={state}
          box={layout.window}
          unit={unit}
          words={words}
          beat={beat}
          selected={selected}
          held={held}
          revealing={revealing}
          onTapCell={(cell) => dispatch({ type: "tapCell", cell })}
          onNudge={(reel, direction) =>
            dispatch({ type: "nudge", reel, direction })
          }
          onToggleLock={(reel) => dispatch({ type: "toggleLock", reel })}
          onSkipReveal={() => dispatch({ type: "skipReveal" })}
          onSpinLanded={setLandedSpin}
        />
        {flying !== undefined ? (
          <ScoreFly
            // One flight per word's beat.
            key={`${state.spinCount}:${flyingIndex}`}
            layout={layout}
            state={state}
            word={flying}
            landsAt={Math.min(meterScore / state.target, 1)}
          />
        ) : null}
        <SlotHint layout={layout}>{hintFor(game, rolling)}</SlotHint>
        <SlotCellKey state={state} unit={unit} box={layout.cellKey} />
        <SlotDeck
          layout={layout}
          moves={state.phase === "moving" ? state.moves : null}
          tokens={state.tokens}
          {...deckButton(game, rolling, sheet.reopen)}
        />
        <SlotPowerShelf layout={layout} state={state} />
      </CabinetStage>
      {/* The sheets sit outside the clipped, fixed-size stage so they measure against the screen. */}
      <SlotRoundSheet
        open={sheet.open}
        state={state}
        payout={payout}
        records={records}
        dispatch={dispatch}
        onDismiss={sheet.dismiss}
      />
      {/* The spin's payout, checkable: every word with the engine's working, its powers, the total. */}
      {payout !== null && payoutShown === payout ? (
        <SlotPayoutSheet state={state} payout={payout} onDismiss={() => setPayoutShown(null)} />
      ) : null}
      {/* The run's details, plainly, until the run menu gets its own design (STO-1190). */}
      <BottomSheet
        containerColor={palette.felt800}
        isPresented={menuOpen}
        onDismiss={() => setMenuOpen(false)}
        testID="slot-run-menu"
      >
        <RNHostView matchContents>
          <View style={styles.menu}>
            <SlotSeedRow
              seed={state.seed}
              onRestart={() => newRun(state.seed)}
              onNewRun={() => newRun(randomSlotSeed())}
            />
            <SlotLineChips state={state} />
            {payout !== null ? (
              <SlotPayoutList
                payout={payout}
                rows={payoutRows(payout)}
                powerMultiplier={state.config.scoringPowerMultiplier}
              />
            ) : null}
            <SlotPowersPanel state={state} />
            <SlotRecordsBlock records={records} />
          </View>
        </RNHostView>
      </BottomSheet>
    </>
  );
}

/** How long a word's points take to fly into the meter; the meter's fill waits about this long to grow. */
const FLY_MS = 380;

interface ScoreFlyProps {
  layout: CabinetLayout;
  state: SlotSpellerState;
  word: SlotWord;
  /** How full the meter is once these points land, 0 to 1: where they fly to. */
  landsAt: number;
}

/** A paid word turning into points: its `+score` lifts off the middle of its bar and pours into the meter's fill. */
function ScoreFly({ layout, state, word, landsAt }: ScoreFlyProps): ReactElement | null {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: FLY_MS, easing: Easing.in(Easing.cubic) });
  }, [progress]);
  const first = word.cells[0];
  const last = word.cells.at(-1);
  const rows = state.grid[0]?.length ?? 3;
  const { window, meter, unit } = layout;
  const a = first === undefined ? { x: 0, y: 0 } : cellCentre(window, unit, state.reels, rows, first);
  const b = last === undefined ? a : cellCentre(window, unit, state.reels, rows, last);
  const from = { x: window.left + (a.x + b.x) / 2, y: window.top + (a.y + b.y) / 2 };
  const to = { x: meter.left + meter.width * landsAt, y: meter.top + meter.height / 2 };
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value < 0.85 ? 1 : (1 - progress.value) / 0.15,
    transform: [
      { translateX: (to.x - from.x) * progress.value },
      // A slight lift before the dive, so the points read as leaving the word.
      { translateY: (to.y - from.y) * progress.value - 24 * unit * Math.sin(Math.PI * progress.value) },
      { scale: 1.5 - 1.1 * progress.value },
    ],
  }));
  if (first === undefined) return null;
  const fontSize = 18 * unit;
  return (
    <Animated.Text
      aria-hidden
      maxFontSizeMultiplier={1}
      style={[
        styles.fly,
        {
          // Centred on the tile by a fixed box: the text is short, and the box keeps the maths plain.
          left: from.x - 40 * unit,
          top: from.y - fontSize,
          width: 80 * unit,
          fontSize,
          lineHeight: fontSize * 1.3,
          backgroundColor: lineColour(word.line),
          borderRadius: fontSize,
        },
        animated,
      ]}
    >
      {`+${word.breakdown.score}`}
    </Animated.Text>
  );
}

/** The line under the reels, by phase. */
function hintFor({ state, revealing, refusedCell }: SlotSpeller, rolling: boolean): string {
  if (revealing) return "Paying out · tap the reels to skip";
  if (refusedCell !== null && state.phase === "moving") {
    const cell = state.config.cells.swapLock === "all" ? "premium" : "word";
    return `A tile on a ${cell} cell can't be swapped · nudge its reel`;
  }
  const toGo = Math.max(state.target - state.roundScore, 0);
  switch (state.phase) {
    case "ready":
      return `Score ${state.target} in ${state.spinsLeft} spins`;
    case "moving":
      if (rolling) return "Reels rolling…";
      return state.moves > 0
        ? "Nudge a reel or swap two tiles"
        : "Out of moves. Pay the grid.";
    case "between": {
      if (!canHold(state)) return `${toGo} to go`;
      const limit = holdLimit(state);
      return `${toGo} to go · hold ${limit === 1 ? "a reel" : `up to ${limit} reels`}`;
    }
    case "shop":
      return "Round cleared";
    case "short":
      return "Out of spins";
    case "over":
      return "Run over";
  }
}

type DeckButton = Pick<
  SlotDeckProps,
  "label" | "accessibilityLabel" | "disabled" | "onPress" | "testID"
>;

/** The deck's green button: Pay while moving, Spin before a spin, and a way back into the round sheet after. */
function deckButton(
  { state, preview, dispatch }: SlotSpeller,
  rolling: boolean,
  openSheet: () => void,
): DeckButton {
  switch (state.phase) {
    case "ready":
    case "between":
      return {
        label: "SPIN",
        accessibilityLabel: "Spin",
        disabled: false,
        onPress: () => dispatch({ type: "spin" }),
        testID: "slot-spin",
      };
    case "moving": {
      const total = preview?.total ?? 0;
      return {
        label: rolling ? "PAY" : `PAY +${total}`,
        accessibilityLabel: rolling ? "Pay" : `Pay ${total} points`,
        disabled: rolling,
        onPress: () => dispatch({ type: "pay" }),
        testID: "slot-pay",
      };
    }
    case "shop":
      return {
        label: "SHOP",
        accessibilityLabel: "Open shop",
        disabled: false,
        onPress: openSheet,
        testID: "slot-open-sheet",
      };
    case "short":
    case "over":
      return {
        label: "RESULTS",
        accessibilityLabel: "See results",
        disabled: false,
        onPress: openSheet,
        testID: "slot-open-sheet",
      };
  }
}

/** The phases whose panel rides in the round sheet. */
const SHEET_PHASES: ReadonlySet<SlotPhase> = new Set(["shop", "short", "over"]);
/** The beat between the payout total landing and the sheet rising over it. */
const SHEET_DELAY_MS = 700;

/**
 * Whether the round sheet is up: once a round ends (cleared, short, or run over) and the payout
 * reveal has had its beat. Tapping the scrim away holds until the next round-end; `reopen` brings it back.
 */
function useRoundSheet(state: SlotSpellerState, revealing: boolean) {
  const key = SHEET_PHASES.has(state.phase)
    ? `${state.phase}:${state.round}:${state.extraSpinUsed}`
    : null;
  const [ready, setReady] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (key === null || revealing) return;
    const timer = setTimeout(
      () => setReady(key),
      reduceMotion ? 0 : SHEET_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [key, revealing, reduceMotion]);

  return {
    open: key !== null && ready === key && dismissed !== key,
    dismiss: () => setDismissed(key),
    reopen: () => setDismissed(null),
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CABINET_GROUND },
  stage: { position: "absolute", overflow: "hidden" },
  dim: { backgroundColor: "rgba(10,30,18,0.35)" },
  fly: {
    position: "absolute",
    overflow: "hidden",
    textAlign: "center",
    color: "#ffffff",
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  menu: {
    alignSelf: "stretch",
    width: "100%",
    gap: spacing.lg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
});
