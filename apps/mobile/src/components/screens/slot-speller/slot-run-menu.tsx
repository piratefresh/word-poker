/**
 * The run's details behind two controls (STO-1190): a power socket's sheet (what a held power does)
 * and the Run menu (lines, cells, records, seed, restart, how it plays). Both ride the round sheets'
 * glossy frame. Shelf overflow: four sockets; past four powers the fourth shows `+n` and opens the rest.
 */

import * as Clipboard from "expo-clipboard";
import { useState, type ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  SLOT_POWERS,
  isSwapLocked,
  powerCount,
  slotLines,
  type SlotPower,
  type SlotPremiumCell,
  type SlotSpellerState,
} from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { fonts } from "@/constants/theme";
import { randomSlotSeed } from "@/features/slot-speller/slot-speller-model";
import type { SlotRecords } from "@/features/slot-speller/slot-speller-save";

import { cellBadge, cellColours, cellPhrase, lineColour } from "./slot-grid";
import { CANDY, Divider, Orb, RecordTile, SheetFrame } from "./slot-round-sheet";

const CREAM = "#fff6e2";
const CREAM_DIM = "rgba(255,246,226,0.75)";
const GOLD = "#f7df7a";

/** The powers the run holds, in the pool's order: what the shelf's sockets show. */
export function heldPowers(state: SlotSpellerState): SlotPower[] {
  return SLOT_POWERS.filter((power) => powerCount(state.powers, power.id) > 0);
}

export interface SlotPowerSheetProps {
  state: SlotSpellerState;
  /** The socket's power, or the powers past the shelf's third socket for `+n`. */
  powers: readonly SlotPower[];
  onDismiss: () => void;
}

/** A socket opened: each power's orb, name and type, its effect, its count, and Zigzag's rows. */
export function SlotPowerSheet({ state, powers, onDismiss }: SlotPowerSheetProps): ReactElement {
  return (
    <SheetFrame title={powers.length === 1 ? "POWER" : "MORE POWERS"} tone="win" onDismiss={onDismiss}>
      {powers.map((power) => {
        const count = powerCount(state.powers, power.id);
        const candy = CANDY[power.type];
        return (
          <View key={power.id} accessible style={styles.power} testID={`slot-power-${power.id}`}>
            <Orb candy={candy} glyph={power.glyph} size={52} />
            <View style={styles.grow}>
              <Text style={styles.powerName}>{count > 1 ? `${power.name} ×${count}` : power.name}</Text>
              <Text style={[styles.powerType, { color: candy.orb }]}>{power.type.toUpperCase()}</Text>
              <Text style={styles.dim}>{power.description}</Text>
              {power.id === "zigzag" && state.zigzagPairs.length > 0 ? (
                <Text style={styles.gold}>
                  {`Pays ${state.zigzagPairs.map((pair) => `rows ${pair + 1}–${pair + 2}`).join(", ")}`}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <GameButton label="BACK TO THE REELS" variant="green" scale={1.3} onPress={onDismiss} testID="slot-power-close" />
    </SheetFrame>
  );
}

export interface SlotRunMenuProps {
  state: SlotSpellerState;
  records: SlotRecords;
  onNewRun: (seed: string) => void;
  onDismiss: () => void;
}

/** What a run-throwing button asks before it acts. */
type Confirming = { label: string; seed: string } | null;

/** The Run menu: lines, cells, records, seed with Copy, Restart and New run (confirmed mid-run), how it plays. */
export function SlotRunMenu({ state, records, onNewRun, onDismiss }: SlotRunMenuProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  // A run is in progress once it has spun, until it is over: only then is there something to lose.
  const inProgress = state.phase !== "over" && (state.round > 1 || state.spinCount > 0);
  const ask = (label: string, seed: string): void => (inProgress ? setConfirming({ label, seed }) : onNewRun(seed));
  const copy = (): void => {
    Clipboard.setStringAsync(state.seed)
      .then((ok) => setCopied(ok))
      .catch(() => setCopied(false));
  };
  const discovered = SLOT_POWERS.filter((power) => records.discovered.includes(power.id));

  return (
    <SheetFrame title="RUN MENU" tone="win" onDismiss={onDismiss}>
      <Divider label="PAYING LINES" />
      <View accessibilityLabel="Paying lines" style={styles.chips} testID="slot-lines">
        {slotLines(state).map((line) => (
          <Text key={line.name} style={[styles.chip, { backgroundColor: lineColour(line.name) }]}>
            {line.name}
          </Text>
        ))}
      </View>

      <Divider label="CELLS" />
      <CellKey state={state} />

      <Divider label="RECORDS" />
      <View style={styles.records} testID="slot-records">
        <RecordTile value={records.furthestRound === 0 ? "–" : `${records.furthestRound}`} label="Furthest round cleared" isNew={false} />
        <RecordTile
          value={records.bestWord === null ? "–" : `${records.bestWord.score}`}
          label={records.bestWord === null ? "Best word" : `Best word · ${records.bestWord.word}`}
          isNew={false}
        />
        <RecordTile value={`${discovered.length}/${SLOT_POWERS.length}`} label="Powers discovered" isNew={false} />
      </View>
      {discovered.length > 0 ? <Text style={[styles.dim, styles.center]}>{discovered.map((power) => power.name).join(", ")}</Text> : null}

      <Divider label="SEED" />
      <View style={styles.seedRow}>
        <Text accessibilityLabel={`Seed ${state.seed}`} selectable style={styles.seed} testID="slot-seed">
          {state.seed}
        </Text>
        <GameButton label={copied ? "Copied" : "Copy"} variant="dark" compact onPress={copy} testID="slot-copy-seed" />
      </View>

      {confirming === null ? (
        <View style={styles.buttons}>
          <GameButton label="Restart this seed" variant="blue" onPress={() => ask("Restart this seed", state.seed)} style={styles.grow} testID="slot-restart" />
          <GameButton label="New run" variant="gold" onPress={() => ask("New run", randomSlotSeed())} style={styles.grow} testID="slot-menu-new-run" />
        </View>
      ) : (
        <View style={styles.confirm} testID="slot-confirm">
          <Text style={[styles.powerName, styles.center]}>{`Throw away round ${state.round}?`}</Text>
          <Text style={[styles.dim, styles.center]}>{"This run's tokens, powers and reels are lost. Records stay."}</Text>
          <View style={styles.buttons}>
            <GameButton label="Keep playing" variant="dark" onPress={() => setConfirming(null)} style={styles.grow} testID="slot-confirm-cancel" />
            <GameButton label={confirming.label} variant="danger" onPress={() => onNewRun(confirming.seed)} style={styles.grow} testID="slot-confirm-ok" />
          </View>
        </View>
      )}

      <Divider label="HOW IT PLAYS" />
      <View style={styles.rules}>
        {HOW_IT_PLAYS.map((line) => (
          <Text key={line} style={styles.dim}>
            {`•  ${line}`}
          </Text>
        ))}
      </View>
    </SheetFrame>
  );
}

/** The cell kinds on the grid now, each with its badge and what it does; swap-locked kinds say so. */
function CellKey({ state }: { state: SlotSpellerState }): ReactElement {
  const kinds = new Map<string, SlotPremiumCell>();
  for (const cell of state.cells) if (cell.reel < state.reels) kinds.set(cellBadge(cell), cell);
  if (kinds.size === 0) return <Text style={[styles.dim, styles.center]}>No premium cells on the grid.</Text>;
  return (
    <View style={styles.cells} testID="slot-menu-cells">
      {[...kinds.values()].map((cell) => {
        const { fill, ink } = cellColours(cell);
        const phrase = cellPhrase(cell);
        return (
          <View key={cellBadge(cell)} style={styles.cellRow}>
            <Text style={[styles.badge, { backgroundColor: fill, color: ink }]}>{cellBadge(cell)}</Text>
            <Text style={[styles.dim, styles.grow]}>
              {`${phrase[0]?.toUpperCase()}${phrase.slice(1)}: ${cell.kind === "letter" ? `×${cell.multiplier} the tile on it` : `×${cell.multiplier} the word over it`}${isSwapLocked(state, [cell.reel, cell.row]) ? " · nudge only" : ""}`}
            </Text>
          </View>
        );
      })}
      <Text style={styles.dim}>Cells count on row lines only and move every spin; ◆ cells stay put.</Text>
    </View>
  );
}

/** The playable build's rules text, as built (docs/rules/slot-speller.md). */
const HOW_IT_PLAYS = [
  "Reach the round's target within 3 spins. Miss it and the run ends.",
  "Each spin gives you moves: nudge a reel up or down a tile, or swap any two tiles. A tile on a word cell can't be swapped.",
  "Every line reads left to right and pays each word of 3+ letters, sharing no tiles, picking the best-scoring set.",
  "A word pays its letter values with cells applied, times its length: ×½ for 3, ×1 for 4–5, ×1.5 for 6, ×2 for 7+.",
  "Between spins, tap a reel to hold it: it keeps its letters and cells through the next spin.",
  "A clear pays 5 tokens plus 2 per unused spin. Spend them in the shop on powers, reels and rows.",
  "Out of spins below target? Once a round, buy one more spin for 3 tokens.",
];

const styles = StyleSheet.create({
  grow: { flex: 1 },
  center: { textAlign: "center" },
  dim: { fontFamily: fonts.uiMedium, fontSize: 13, lineHeight: 18, color: CREAM_DIM },
  gold: { fontFamily: fonts.ui, fontSize: 13, color: GOLD, marginTop: 2 },
  power: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.35)" },
  powerName: { fontFamily: fonts.ui, fontSize: 17, color: CREAM },
  powerType: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  chip: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden", fontFamily: fonts.ui, fontSize: 13, color: "#ffffff" },
  cells: { gap: 6 },
  cellRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: { minWidth: 40, textAlign: "center", paddingVertical: 2, paddingHorizontal: 4, borderRadius: 5, overflow: "hidden", fontFamily: fonts.ui, fontSize: 12 },
  records: { flexDirection: "row", gap: 8, paddingTop: 6 },
  seedRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  seed: { fontFamily: fonts.ui, fontSize: 18, letterSpacing: 2, color: GOLD },
  buttons: { flexDirection: "row", gap: 10 },
  confirm: { gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: "rgba(255,138,92,0.5)", backgroundColor: "rgba(0,0,0,0.35)" },
  rules: { gap: 6 },
});
