import { router } from "expo-router";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  canLock,
  type Dictionary,
  type SlotPhase,
  type SlotSpellerState,
  type SlotWord,
} from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import {
  colors,
  fonts,
  fontSize,
  radius,
  spacing,
  type,
} from "@/constants/theme";
import {
  payoutRows,
  randomSlotSeed,
  type SlotSpellerAction,
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
import { webTestID } from "@/lib/ui/web-id";

import { SlotGrid } from "./slot-grid";
import { SlotHud } from "./slot-hud";
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

export interface SlotSpellerScreenProps {
  /** A saved run to resume (persistence hangs off this and `onChange`). */
  initialState?: SlotSpellerState;
  onChange?: (state: SlotSpellerState, previous: SlotSpellerState) => void;
}

/** Slot Speller (§47): one solo run on the engine, in-process, held until the dictionary loads. */
export function SlotSpellerScreen({
  initialState,
  onChange,
}: SlotSpellerScreenProps): ReactElement {
  const insets = useSafeAreaInsets();
  const dictionary = useDictionary();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          id={webTestID("slot-back")}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={styles.back}
          testID="slot-back"
        >
          <Text style={styles.backText}>‹ BACK</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>
          Slot Speller
        </Text>
      </View>
      {dictionary === null ? (
        <View style={styles.loading}>
          <Text style={type.bodyDim}>Loading the reels…</Text>
        </View>
      ) : (
        <SlotSpellerTable
          dictionary={dictionary}
          initialState={initialState}
          onChange={onChange}
          bottomInset={insets.bottom}
        />
      )}
    </View>
  );
}

interface SlotSpellerTableProps extends SlotSpellerScreenProps {
  dictionary: Dictionary;
  bottomInset: number;
}

function SlotSpellerTable({
  dictionary,
  initialState,
  onChange,
  bottomInset,
}: SlotSpellerTableProps): ReactElement {
  const game = useSlotSpeller({ dictionary, initialState, onChange });
  const scroll = useRef<ScrollView>(null);
  // A new round or run starts at the top (seed row, HUD), not wherever the shop left the scroll.
  const dispatch = (action: SlotSpellerAction): void => {
    game.dispatch(action);
    if (action.type === "nextRound" || action.type === "newRun")
      scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const { state, payout, revealStep, preview, selected, held, revealing } =
    game;
  const records = useSlotRecords();
  const sheet = useRoundSheet(state, revealing);
  // The last spin whose reels have all landed; a newer spin is still rolling in.
  const [landedSpin, setLandedSpin] = useState(state.spinCount);
  const rolling = state.spinCount !== landedSpin;

  const shown = payoutRows(payout).slice(0, revealStep);
  const lit: SlotWord[] = [];
  for (const row of shown) {
    const word = row.kind === "word" ? payout?.words[row.index] : undefined;
    if (word !== undefined) lit.push(word);
  }

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: bottomInset + spacing.xxl },
      ]}
    >
      <SlotSeedRow
        seed={state.seed}
        onRestart={() => dispatch({ type: "newRun", seed: state.seed })}
        onNewRun={() => dispatch({ type: "newRun", seed: randomSlotSeed() })}
      />
      <SlotHud state={state} preview={rolling ? 0 : (preview?.total ?? 0)} />
      <SlotGrid
        state={state}
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
      <SlotLineChips state={state} />
      {revealing ? (
        <Text style={styles.hint}>Tap the reels to skip</Text>
      ) : (
        <SlotActions
          game={game}
          dispatch={dispatch}
          rolling={rolling}
          onOpenSheet={sheet.reopen}
        />
      )}
      {payout !== null ? (
        <SlotPayoutList
          payout={payout}
          rows={shown}
          powerMultiplier={state.config.scoringPowerMultiplier}
        />
      ) : null}
      <SlotPowersPanel state={state} />
      {state.phase === "over" ? null : <SlotRecordsBlock records={records} />}
      <SlotRoundSheet
        open={sheet.open}
        state={state}
        payout={payout}
        onDismiss={sheet.dismiss}
      >
        <RoundPanel state={state} dispatch={dispatch} records={records} />
      </SlotRoundSheet>
    </ScrollView>
  );
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

/** What the phase asks for next: spin, pay, or (once a round ends) a way back into the round sheet. */
function SlotActions({
  game,
  dispatch,
  rolling,
  onOpenSheet,
}: {
  game: SlotSpeller;
  dispatch: SlotSpeller["dispatch"];
  /** Reels still rolling in: Pay waits for them, and keeps the total to itself until they land. */
  rolling: boolean;
  onOpenSheet: () => void;
}): ReactElement {
  const { state, preview } = game;
  const toGo = Math.max(state.target - state.roundScore, 0);
  const spinButton = (
    <GameButton
      label="Spin"
      variant="gold"
      onPress={() => dispatch({ type: "spin" })}
      style={styles.wide}
      testID="slot-spin"
    />
  );

  switch (state.phase) {
    case "ready":
      return (
        <View style={styles.actions}>
          <Text
            style={styles.hint}
          >{`Round ${state.round}: score ${state.target} in ${state.spinsLeft} spins.`}</Text>
          {spinButton}
        </View>
      );
    case "moving":
      return (
        <View style={styles.actions}>
          <Text style={styles.hint}>
            {rolling
              ? "Reels rolling…"
              : state.moves > 0
                ? "Nudge a reel, or tap two tiles to swap them."
                : "Out of moves — pay the grid."}
          </Text>
          <GameButton
            label={rolling ? "Pay" : `Pay ${preview?.total ?? 0}`}
            variant="green"
            disabled={rolling}
            onPress={() => dispatch({ type: "pay" })}
            style={styles.wide}
            testID="slot-pay"
          />
        </View>
      );
    case "between":
      return (
        <View style={styles.actions}>
          <Text
            style={styles.hint}
          >{`${toGo} to go · ${state.spinsLeft} ${state.spinsLeft === 1 ? "spin" : "spins"} left`}</Text>
          {canLock(state) ? (
            <Text
              style={styles.hint}
            >{`Reel Lock: hold up to ${state.config.lockReels} reels through the next spin.`}</Text>
          ) : null}
          {spinButton}
        </View>
      );
    case "shop":
    case "short":
    case "over":
      return (
        <GameButton
          label={state.phase === "shop" ? "Open shop" : "See results"}
          variant="gold"
          onPress={onOpenSheet}
          style={styles.wide}
          testID="slot-open-sheet"
        />
      );
  }
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
          onBuyPower={(power) => dispatch({ type: "buyPower", power })}
          onBuyReel={() => dispatch({ type: "buyReel" })}
          onReroll={() => dispatch({ type: "reroll" })}
          onNextRound={() => dispatch({ type: "nextRound" })}
        />
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingBottom: spacing.sm,
  },
  back: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  backText: {
    fontFamily: fonts.ui,
    fontSize: fontSize.small,
    color: colors.gold,
  },
  title: {
    fontFamily: fonts.slab,
    fontSize: fontSize.title,
    color: colors.textBright,
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: {
    gap: spacing.lg,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.sm,
  },
  actions: { gap: spacing.sm, alignItems: "stretch" },
  wide: { alignSelf: "stretch" },
  hint: { ...type.bodyDim, textAlign: "center" },
});
