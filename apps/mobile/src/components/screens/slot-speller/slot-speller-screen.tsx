import { router } from "expo-router";
import { useRef, type ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { canLock, type Dictionary, type SlotSpellerState, type SlotWord } from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, fontSize, radius, spacing, type } from "@/constants/theme";
import { payoutRows, randomSlotSeed, type SlotSpellerAction } from "@/features/slot-speller/slot-speller-model";
import { useSlotRecords, type SlotRecords } from "@/features/slot-speller/slot-speller-save";
import { useSlotSpeller, type SlotSpeller } from "@/features/slot-speller/use-slot-speller";
import { useDictionary } from "@/features/table/use-dictionary";
import { webTestID } from "@/lib/ui/web-id";

import { SlotGrid } from "./slot-grid";
import { SlotHud } from "./slot-hud";
import { OutOfSpinsPanel, RunOverPanel } from "./slot-outcome-panels";
import { SlotPayoutList } from "./slot-payout-list";
import { SlotLineChips, SlotPowersPanel, SlotRecordsBlock, SlotSeedRow } from "./slot-run-info";
import { SlotShopPanel } from "./slot-shop-panel";

export interface SlotSpellerScreenProps {
  /** A saved run to resume (persistence hangs off this and `onChange`). */
  initialState?: SlotSpellerState;
  onChange?: (state: SlotSpellerState, previous: SlotSpellerState) => void;
}

/** Slot Speller (§47): one solo run on the engine, in-process, held until the dictionary loads. */
export function SlotSpellerScreen({ initialState, onChange }: SlotSpellerScreenProps): ReactElement {
  const insets = useSafeAreaInsets();
  const dictionary = useDictionary();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          id={webTestID("slot-back")}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
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
        <SlotSpellerTable dictionary={dictionary} initialState={initialState} onChange={onChange} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

interface SlotSpellerTableProps extends SlotSpellerScreenProps {
  dictionary: Dictionary;
  bottomInset: number;
}

function SlotSpellerTable({ dictionary, initialState, onChange, bottomInset }: SlotSpellerTableProps): ReactElement {
  const game = useSlotSpeller({ dictionary, initialState, onChange });
  const scroll = useRef<ScrollView>(null);
  // A new round or run starts at the top (seed row, HUD), not wherever the shop left the scroll.
  const dispatch = (action: SlotSpellerAction): void => {
    game.dispatch(action);
    if (action.type === "nextRound" || action.type === "newRun") scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const { state, payout, revealStep, preview, selected, held, revealing } = game;
  const records = useSlotRecords();

  const shown = payoutRows(payout).slice(0, revealStep);
  const lit: SlotWord[] = [];
  for (const row of shown) {
    const word = row.kind === "word" ? payout?.words[row.index] : undefined;
    if (word !== undefined) lit.push(word);
  }

  return (
    <ScrollView ref={scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomInset + spacing.xxl }]}>
      <SlotSeedRow
        seed={state.seed}
        onRestart={() => dispatch({ type: "newRun", seed: state.seed })}
        onNewRun={() => dispatch({ type: "newRun", seed: randomSlotSeed() })}
      />
      <SlotHud state={state} preview={preview?.total ?? 0} />
      <SlotGrid
        state={state}
        outlined={preview?.words ?? []}
        lit={lit}
        selected={selected}
        held={held}
        revealing={revealing}
        onTapCell={(cell) => dispatch({ type: "tapCell", cell })}
        onNudge={(reel, direction) => dispatch({ type: "nudge", reel, direction })}
        onToggleLock={(reel) => dispatch({ type: "toggleLock", reel })}
        onSkipReveal={() => dispatch({ type: "skipReveal" })}
      />
      <SlotLineChips state={state} />
      {revealing ? <Text style={styles.hint}>Tap the reels to skip</Text> : <SlotActions game={game} dispatch={dispatch} records={records} />}
      {payout !== null ? (
        <SlotPayoutList payout={payout} rows={shown} powerMultiplier={state.config.scoringPowerMultiplier} />
      ) : null}
      <SlotPowersPanel state={state} />
      {state.phase === "over" ? null : <SlotRecordsBlock records={records} />}
    </ScrollView>
  );
}

/** What the phase asks for next: spin, pay, or the end-of-spin panel. */
function SlotActions({
  game,
  dispatch,
  records,
}: {
  game: SlotSpeller;
  dispatch: SlotSpeller["dispatch"];
  records: SlotRecords;
}): ReactElement {
  const { state, preview } = game;
  const toGo = Math.max(state.target - state.roundScore, 0);
  const spinButton = (
    <GameButton label="Spin" variant="gold" onPress={() => dispatch({ type: "spin" })} style={styles.wide} testID="slot-spin" />
  );

  switch (state.phase) {
    case "ready":
      return (
        <View style={styles.actions}>
          <Text style={styles.hint}>{`Round ${state.round}: score ${state.target} in ${state.spinsLeft} spins.`}</Text>
          {spinButton}
        </View>
      );
    case "moving":
      return (
        <View style={styles.actions}>
          <Text style={styles.hint}>
            {state.moves > 0 ? "Nudge a reel, or tap two tiles to swap them." : "Out of moves — pay the grid."}
          </Text>
          <GameButton
            label={`Pay ${preview?.total ?? 0}`}
            variant="green"
            onPress={() => dispatch({ type: "pay" })}
            style={styles.wide}
            testID="slot-pay"
          />
        </View>
      );
    case "between":
      return (
        <View style={styles.actions}>
          <Text style={styles.hint}>{`${toGo} to go · ${state.spinsLeft} ${state.spinsLeft === 1 ? "spin" : "spins"} left`}</Text>
          {canLock(state) ? (
            <Text style={styles.hint}>{`Reel Lock: hold up to ${state.config.lockReels} reels through the next spin.`}</Text>
          ) : null}
          {spinButton}
        </View>
      );
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
  backText: { fontFamily: fonts.ui, fontSize: fontSize.small, color: colors.gold },
  title: { fontFamily: fonts.slab, fontSize: fontSize.title, color: colors.textBright },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { gap: spacing.lg, paddingHorizontal: spacing.gutter, paddingTop: spacing.sm },
  actions: { gap: spacing.sm, alignItems: "stretch" },
  wide: { alignSelf: "stretch" },
  hint: { ...type.bodyDim, textAlign: "center" },
});
