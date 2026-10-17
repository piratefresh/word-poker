/**
 * use-balance-view.ts — the in-hand HUD's read of the Wallet, for online tables only (STO-562).
 *
 * Offline and the tutorial are free play (ADR 0002) and never reach the Wallet: they hand the
 * HUD `FREE_PLAY`. This hook is for a real online seat, where the chip is the signed-in
 * player's coins. Like `BalanceView` itself, it keeps every way of not knowing the figure
 * separate — a stalled fetch painted as `$0` would tell the player they are broke.
 */

import { useEffect, useState } from "react";

import { authClient } from "@/auth/client/auth-client";
import type { BalanceView } from "@/components/hud";
import { fetchWallet, WalletAuthError } from "@/lib/wallet/wallet-client";

/**
 * Reads the signed-in player's coins, and reads them again whenever the session's player
 * changes or `settleKey` does — the online felt passes the hand's id, marked once the hand
 * reaches payout, so a settled pot re-reads the balance without the HUD owning game state.
 */
export function useBalanceView(settleKey?: string | null): BalanceView {
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user.id;
  // What names this read: the player it is for, and the hand state that asked. A read only
  // speaks for its own key, so a new hand or a new player retires the old figure.
  const key = `${userId ?? ""}|${settleKey ?? ""}`;
  const [read, setRead] = useState<{ key: string; view: BalanceView } | null>(null);

  useEffect(() => {
    if (isPending || !userId) return;
    let current = true;
    fetchWallet()
      .then((wallet) => {
        if (current) setRead({ key, view: { state: "ready", amount: wallet.coins } });
      })
      .catch((error: unknown) => {
        if (!current) return;
        // The route's 401 says the session is gone (or never was): the chip's one control —
        // sign in — is the honest readout.
        setRead({
          key,
          view:
            error instanceof WalletAuthError
              ? { state: "signed-out" }
              : { state: "unavailable" },
        });
      });
    return () => {
      current = false;
    };
  }, [isPending, key, settleKey, userId]);

  // Everything before the answer is derived, not stored: a session still resolving and a
  // seated player are both loading; a resolved session with no player is signed out.
  if (read !== null && read.key === key) return read.view;
  return isPending || userId ? { state: "loading" } : { state: "signed-out" };
}
