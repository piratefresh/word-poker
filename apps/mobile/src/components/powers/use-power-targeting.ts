import { useCallback, useState } from "react";

import { POWER_UPS, type PowerUpId, type Tile as TileData } from "@wordpoker/contracts";

import type { PowerView } from "@/features/table/power-view";

/**
 * Where the hero is in using its held power (§44): nothing yet, choosing which private tile to
 * discard, or asked to confirm the one it chose. A hostile power (§46) also carries the opponent
 * it will act on, which the confirm can change.
 */
export type PowerTargeting =
  | { readonly stage: "idle" }
  | { readonly stage: "picking" }
  | { readonly stage: "confirming"; readonly tile: TileData; readonly targetId?: string };

/** An opponent a hostile power can name: a seat still in the hand that is not the hero's. */
export interface PowerOpponent {
  readonly id: string;
  readonly name: string;
}

const IDLE: PowerTargeting = { stage: "idle" };

/**
 * The held power's use, from the chip's tap to the confirm: tap the chip and the rack waits for a
 * private tile, tap one and the felt asks to confirm, confirm and the power is spent on it.
 *
 * The table decides when that can happen, never this hook: the moment the adapter stops calling
 * the power usable — the turn moved on, the clock ran out, the word was confirmed — the flow is
 * back at idle, whatever stage it had reached.
 *
 * It also keeps the tile the hero discarded. The table only reports the swap's result, and the
 * flip in the rack turns *from* that tile, so the hook remembers what it handed over.
 */
export function usePowerTargeting({
  held,
  onUse,
  opponents = [],
}: {
  held: PowerView["held"] | undefined;
  onUse: (powerUpId: PowerUpId, tileId: string, targetId?: string) => void;
  /** The seats a hostile power may name, in table order; the confirm starts on the first. */
  opponents?: readonly PowerOpponent[];
}) {
  const [stage, setStage] = useState<PowerTargeting>(IDLE);
  const [discarded, setDiscarded] = useState<TileData | null>(null);

  const usable = held?.usable === true;
  // Dropped rather than only hidden, so a stage the table cut short does not come back on the
  // seat's next turn.
  if (!usable && stage.stage !== "idle") setStage(IDLE);
  const targeting = usable ? stage : IDLE;

  // The chip toggles the rack in and out of choosing; a second tap is the cancel.
  const toggle = useCallback(() => {
    if (!usable) return;
    setStage((current) => (current.stage === "idle" ? { stage: "picking" } : IDLE));
  }, [usable]);

  const hostile = held != null && POWER_UPS[held.id].hostile;
  const firstOpponent = opponents[0]?.id;
  const pick = useCallback(
    (tile: TileData) =>
      setStage({ stage: "confirming", tile, ...(hostile && firstOpponent !== undefined ? { targetId: firstOpponent } : {}) }),
    [hostile, firstOpponent],
  );

  /** The confirm's opponent choice, for a hostile power at a table with more than one. */
  const aim = useCallback(
    (targetId: string) => setStage((current) => (current.stage === "confirming" ? { ...current, targetId } : current)),
    [],
  );

  const cancel = useCallback(() => setStage(IDLE), []);

  const confirm = useCallback(() => {
    if (targeting.stage !== "confirming" || held == null) return;
    setDiscarded(targeting.tile);
    setStage(IDLE);
    if (targeting.targetId === undefined) onUse(held.id, targeting.tile.id);
    else onUse(held.id, targeting.tile.id, targeting.targetId);
  }, [held, onUse, targeting]);

  // Spotlight and Tile Lock aim at a dealt table tile; every other power at one of the seat's own.
  const family = held == null ? null : POWER_UPS[held.id].family;
  const aimsAtTable = family === "spotlight" || family === "tileLock";
  const picking = targeting.stage === "picking";

  return {
    targeting,
    discarded,
    toggle,
    pick,
    aim,
    cancel,
    confirm,
    /** The rack's tap while choosing; `undefined` when the power does not aim at the rack. */
    ownPick: picking && !aimsAtTable ? pick : undefined,
    /** The community row's tap while choosing; `undefined` when the power does not aim at the table. */
    tablePick: picking && aimsAtTable ? pick : undefined,
    /** Which power aims at the table, for the row's labels and which tiles it offers. */
    tableAim: family === "tileLock" ? ("lock" as const) : ("spotlight" as const),
  };
}

/**
 * The rack's flip for a swap the hero made: the new tile's id and the tile it turns over from,
 * or `null` while there is no swap, or no record of the tile it replaced (a table rejoined after
 * the swap shows the new tile outright).
 */
export function swapFlipOf(
  swap: PowerView["swap"] | undefined,
  discarded: TileData | null,
): { readonly tileId: string; readonly from: TileData } | null {
  if (swap == null || discarded === null || discarded.id !== swap.discardedTileId) return null;
  return { tileId: swap.tile.id, from: discarded };
}
