import { BottomSheet, RNHostView } from "@expo/ui";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  canHold,
  holdLimit,
  type Dictionary,
  type SlotPhase,
  type SlotSpellerState,
  type SlotWord,
} from "@wordpoker/game-rules";

import { palette, spacing } from "@/constants/theme";
import {
  payoutRows,
  randomSlotSeed,
} from "@/features/slot-speller/slot-speller-model";
import {
  useSlotRecords,
  type SlotRecords,
} from "@/features/slot-speller/slot-speller-save";
import {
  useSlotSpeller,
  type SlotSpeller,
} from "@/features/slot-speller/use-slot-speller";
import { useDictionary } from "@/features/table/use-dictionary";

import {
  ARTBOARD,
  SlotDeck,
  SlotHeader,
  SlotHint,
  SlotPlaques,
  SlotPowerShelf,
  type SlotDeckProps,
} from "./slot-cabinet";
import { SlotCellKey, SlotGrid } from "./slot-grid";
import { OutOfSpinsPanel, RunOverPanel } from "./slot-outcome-panels";
import { SlotPayoutList } from "./slot-payout-list";
import { SlotRoundSheet } from "./slot-round-sheet";
import {
  SlotLineChips,
  SlotPowersPanel,
  SlotRecordsBlock,
  SlotSeedRow,
} from "./slot-run-info";
import { SlotShopPanel } from "./slot-shop-panel";

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

/**
 * The G1 stage: the 390 × 844 artboard scaled to fit the device, centred across, sat on the
 * bottom edge (the power shelf runs down to it), and its header kept clear of the status bar.
 */
function useStage() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const unit = Math.min(
    width / ARTBOARD.width,
    height / ARTBOARD.height,
    (height - insets.top - spacing.sm) / (ARTBOARD.height - HEADER_TOP),
  );
  return {
    unit,
    left: (width - ARTBOARD.width * unit) / 2,
    top: height - ARTBOARD.height * unit,
    width: ARTBOARD.width * unit,
    height: ARTBOARD.height * unit,
  };
}

const goBack = (): void =>
  router.canGoBack() ? router.back() : router.replace("/");

type Stage = ReturnType<typeof useStage>;

/** The painted cabinet at the stage's size; everything drawn on the art goes inside it. */
function CabinetStage({
  stage,
  children,
}: {
  stage: Stage;
  children: ReactNode;
}): ReactElement {
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
        contentFit="fill"
        source={CABINET_ART}
        style={StyleSheet.absoluteFill}
      />
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
  const stage = useStage();

  return (
    <View style={styles.screen}>
      {dictionary === null ? (
        <CabinetStage stage={stage}>
          <SlotHint unit={stage.unit}>Loading the reels…</SlotHint>
        </CabinetStage>
      ) : (
        <SlotSpellerTable
          dictionary={dictionary}
          initialState={initialState}
          onChange={onChange}
          stage={stage}
        />
      )}
    </View>
  );
}

interface SlotSpellerTableProps extends SlotSpellerScreenProps {
  dictionary: Dictionary;
  stage: Stage;
}

function SlotSpellerTable({
  dictionary,
  initialState,
  onChange,
  stage,
}: SlotSpellerTableProps): ReactElement {
  const { unit } = stage;
  const game = useSlotSpeller({ dictionary, initialState, onChange });
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
  const livePreview =
    state.phase === "moving" && !rolling ? (preview?.total ?? 0) : 0;

  const shown = payoutRows(payout).slice(0, revealStep);
  const lit: SlotWord[] = [];
  for (const row of shown) {
    const word = row.kind === "word" ? payout?.words[row.index] : undefined;
    if (word !== undefined) lit.push(word);
  }

  const newRun = (seed: string): void => {
    setMenuOpen(false);
    dispatch({ type: "newRun", seed });
  };

  return (
    <>
      <CabinetStage stage={stage}>
        <SlotHeader
          unit={unit}
          state={state}
          preview={livePreview}
          onBack={goBack}
          onMenu={() => setMenuOpen(true)}
        />
        <SlotPlaques unit={unit} state={state} />
        <SlotGrid
          state={state}
          unit={unit}
          outlined={preview?.words ?? []}
          lit={lit}
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
        <SlotHint unit={unit}>{hintFor(game, rolling)}</SlotHint>
        <SlotCellKey state={state} unit={unit} top={CELL_KEY_TOP} width={ARTBOARD.width * unit} />
        <SlotDeck
          unit={unit}
          moves={state.phase === "moving" ? state.moves : null}
          tokens={state.tokens}
          {...deckButton(game, rolling, sheet.reopen)}
        />
        <SlotPowerShelf unit={unit} state={state} />
      </CabinetStage>
      {/* The sheets sit outside the clipped, fixed-size stage so they measure against the screen. */}
      <SlotRoundSheet
        open={sheet.open}
        state={state}
        payout={payout}
        onDismiss={sheet.dismiss}
      >
        <RoundPanel state={state} dispatch={dispatch} records={records} />
      </SlotRoundSheet>
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

/** The cell key's top, in artboard px: between the hint line and the control deck. */
const CELL_KEY_TOP = 603;

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
 * reveal has had its beat. Swiping it away holds until the next round-end; `reopen` brings it back.
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

/** The round sheet's body: the shop after a clear, the Extra Spin offer when short, or the run's summary. */
function RoundPanel({
  state,
  dispatch,
  records,
}: {
  state: SlotSpellerState;
  dispatch: SlotSpeller["dispatch"];
  records: SlotRecords;
}): ReactElement | null {
  switch (state.phase) {
    case "short":
      return (
        <OutOfSpinsPanel
          state={state}
          onExtraSpin={() => dispatch({ type: "extraSpin" })}
          onEndRun={() => dispatch({ type: "endRun" })}
        />
      );
    case "over":
      return (
        <RunOverPanel
          state={state}
          records={<SlotRecordsBlock records={records} />}
          onReplay={() => dispatch({ type: "newRun", seed: state.seed })}
          onNewRun={() => dispatch({ type: "newRun", seed: randomSlotSeed() })}
        />
      );
    case "shop":
      return (
        <SlotShopPanel
          state={state}
          onBuyPower={(power, pair) =>
            dispatch(
              pair === undefined
                ? { type: "buyPower", power }
                : { type: "buyPower", power, pair },
            )
          }
          onBuyReel={() => dispatch({ type: "buyReel" })}
          onBuyRow={() => dispatch({ type: "buyRow" })}
          onReroll={() => dispatch({ type: "reroll" })}
          onNextRound={() => dispatch({ type: "nextRound" })}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CABINET_GROUND },
  stage: { position: "absolute", overflow: "hidden" },
  menu: {
    alignSelf: "stretch",
    width: "100%",
    gap: spacing.lg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
});
