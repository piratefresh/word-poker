/**
 * vip-look.ts — how a VIP tier looks in the app (STO-1170): one color per tier, the ladder's
 * order from `VIP_TIERS`. The design is the "VIP Loyalty Ideas" page of the design canvas.
 */

import { VIP_PURCHASE_POINTS, VIP_TIERS, vipTier } from "@wordpoker/game-rules";
import { isCoinPackId } from "@wordpoker/contracts";

const TIER_COLORS = ["#9aa3bb", "#6cc48c", "#f0c04e", "#ee8a46", "#5ab0ec", "#b47ff0", "#ff6b7d"] as const;

/** The tier's own color, used for its chip, diamond and name. */
export function tierColor(tier: number): string {
  return TIER_COLORS[tier] ?? TIER_COLORS[0];
}

/** "Card Shark" → "CARD SHARK", the arcade face every tier name is set in. */
export function tierLabel(tier: number): string {
  return (VIP_TIERS[tier] ?? vipTier(0)).name.toUpperCase();
}

/** VIP Points a coin pack gives, or 0 for a product that isn't one. */
export function packVipPoints(productId: string): number {
  return isCoinPackId(productId) ? VIP_PURCHASE_POINTS[productId] : 0;
}
