/**
 * vip-awarder.ts — the room's link to VIP Points (STO-1170).
 *
 * Built like the table wallet: the server's database plus RevenueCat, or `null` when either is
 * missing, in which case the room simply awards nothing (a dev server, a smoke run).
 */

import type { VipAward, VipHandFacts } from "@wordpoker/contracts";
import {
  openWalletEvent,
  pendingWalletEvents,
  recordVipPoints,
  setVipTierPaid,
  settleWalletEvent,
  buyInFor,
  vipProgress,
} from "@wordpoker/db";
import { awardVipHand, awardVipMatch, type VipDeps } from "@wordpoker/economy";

import { serverOrm } from "../database.js";

export interface VipAwarder {
  hand(userId: string, handToken: string, facts: VipHandFacts): Promise<VipAward>;
  match(userId: string, matchToken: string): Promise<VipAward>;
}

export function createVipAwarder(deps: VipDeps): VipAwarder {
  return {
    hand: (userId, handToken, facts) => awardVipHand(userId, handToken, facts, deps),
    match: (userId, matchToken) => awardVipMatch(userId, matchToken, deps),
  };
}

export async function vipAwarderFromEnv(): Promise<VipAwarder | null> {
  if (!process.env.REVENUECAT_PROJECT_ID || !process.env.REVENUECAT_SECRET_API_KEY) return null;
  const orm = await serverOrm();
  if (orm === null) return null;

  return createVipAwarder({
    store: {
      openWalletEvent: (input) => openWalletEvent(input, { orm }),
      settleWalletEvent: (id, input) => settleWalletEvent(id, input, { orm }),
      pendingWalletEvents: (userId) => pendingWalletEvents(userId, { orm }),
      buyInFor: (userId, ref) => buyInFor(userId, ref, { orm }),
    },
    vip: {
      vipProgress: (userId, day) => vipProgress(userId, day, { orm }),
      recordVipPoints: (userId, token, day, apply) => recordVipPoints(userId, token, day, apply, { orm }),
      setVipTierPaid: (userId, tier) => setVipTierPaid(userId, tier, { orm }),
    },
  });
}
