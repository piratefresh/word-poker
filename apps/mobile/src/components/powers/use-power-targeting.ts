import { useCallback, useState } from "react";

import type { PowerUpId, Tile as TileData } from "@wordpoker/contracts";

import type { PowerView } from "@/lib/power-view";

/**
 * Where the hero is in using its held power (§44): nothing yet, choosing which private tile to
 * discard, or asked to confirm the one it chose.
 */
export type PowerTargeting =
  | { readonly stage: "idle" }
  | { readonly stage: "picking" }
  | { readonly stage: "confirming"; readonly tile: TileData };

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
}: {
  held: PowerView["held"] | undefined;
  onUse: (powerUpId: PowerUpId, tileId: string) => void;
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

  const pick = useCallback((tile: TileData) => setStage({ stage: "confirming", tile }), []);

  const cancel = useCallback(() => setStage(IDLE), []);

  const confirm = useCallback(() => {
    if (targeting.stage !== "confirming" || held == null) return;
    setDiscarded(targeting.tile);
    setStage(IDLE);
    onUse(held.id, targeting.tile.id);
  }, [held, onUse, targeting]);

  return { targeting, discarded, toggle, pick, cancel, confirm };
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
