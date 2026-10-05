/**
 * quests-provider.tsx — the signed-in player's quest state, held once for the app (STO-525).
 *
 * Mounted once in `src/app/_layout.tsx`, beside the session it follows: signed out, or signed in
 * but not yet email-verified, it holds nothing and sends nothing (`wallet-client.ts`'s own
 * `WalletUnverifiedError` is the server saying the same thing, this just never asks). `reportHand`
 * is the one way a table tells it about a settled hand — minted a token so a retried claim is
 * safe — and `refresh` is what re-reads the streak and quest state (the quests screen's own pull).
 *
 * ponytail: `lastCompletions` updates once the server answers the claim, not optimistically ahead
 * of it — a local mirror of `applyQuestHand` would need the per-quest `streak` counter this
 * state's own `QuestStateResponse` does not carry, and AGENTS.md's prediction is for instant UI,
 * not for a reward the server has not actually granted yet. Add the optimistic mirror if the
 * round trip ever reads as slow in practice.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import type { QuestHandFacts, QuestId, QuestStateResponse } from "@wordpoker/contracts";

import { authClient } from "@/auth/client/auth-client";
import { fetchQuestState, fetchWallet, sendQuestHandClaim } from "@/lib/wallet-client";

/** A streak reward paid by the most recent read — what the home banner announces. */
export interface StreakBanner {
  readonly day: number;
  readonly reward: number;
}

export interface QuestsValue {
  /** The Wallet's balance, read alongside quest state; `null` until the first read lands. */
  readonly coins: number | null;
  readonly state: QuestStateResponse | null;
  /** What the most recently answered claim completed; cleared by the next `reportHand`. */
  readonly lastCompletions: readonly QuestId[];
  readonly streakBanner: StreakBanner | null;
  readonly dismissStreakBanner: () => void;
  /** Reports one settled hand's quest facts. A `null` (no hero seat) is a no-op. */
  readonly reportHand: (facts: QuestHandFacts | null) => void;
  /** Re-reads the streak and quest state — the quests screen's own pull on mount. */
  readonly refresh: () => void;
}

const DEFAULT_VALUE: QuestsValue = {
  coins: null,
  state: null,
  lastCompletions: [],
  streakBanner: null,
  dismissStreakBanner: () => {},
  reportHand: () => {},
  refresh: () => {},
};

const QuestsContext = createContext<QuestsValue>(DEFAULT_VALUE);

export function useQuests(): QuestsValue {
  return useContext(QuestsContext);
}

interface QueuedClaim {
  readonly handToken: string;
  readonly facts: QuestHandFacts;
}

/** A fresh id per claim — a dedupe key, not a secret, so a retry under the same one is safe. */
function mintHandToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function QuestsProvider({ children }: { children: ReactNode }): ReactElement {
  const { data: session } = authClient.useSession();
  const authorized = Boolean(session) && session?.user.emailVerified === true;

  const [coins, setCoins] = useState<number | null>(null);
  const [state, setState] = useState<QuestStateResponse | null>(null);
  const [lastCompletions, setLastCompletions] = useState<readonly QuestId[]>([]);
  const [streakBanner, setStreakBanner] = useState<StreakBanner | null>(null);
  // Claims a dropped connection never answered — flushed the next time there is a hand to report.
  const queued = useRef<QueuedClaim[]>([]);

  const readWallet = useCallback(() => {
    fetchWallet()
      .then((wallet) => setCoins(wallet.coins))
      .catch(() => {});
  }, []);

  const refresh = useCallback(() => {
    fetchQuestState()
      .then((next) => {
        setState(next);
        if (next.streak.creditedToday !== null) {
          setStreakBanner({ day: next.streak.current, reward: next.streak.creditedToday });
        }
      })
      .catch(() => {});
    readWallet();
  }, [readWallet]);

  useEffect(() => {
    if (!authorized) {
      setCoins(null);
      setState(null);
      setLastCompletions([]);
      setStreakBanner(null);
      queued.current = [];
      return;
    }

    refresh();
  }, [authorized, refresh]);

  const send = useCallback(
    (claim: QueuedClaim) => {
      sendQuestHandClaim(claim)
        .then((result) => {
          if (result.duplicate || result.completed.length === 0) return;
          setLastCompletions(result.completed);
          readWallet();
          fetchQuestState()
            .then(setState)
            .catch(() => {});
        })
        .catch(() => {
          queued.current.push(claim);
        });
    },
    [readWallet],
  );

  const reportHand = useCallback(
    (facts: QuestHandFacts | null) => {
      if (!authorized || facts === null) return;

      const retrying = queued.current;
      queued.current = [];
      for (const claim of retrying) send(claim);

      send({ handToken: mintHandToken(), facts });
    },
    [authorized, send],
  );

  const dismissStreakBanner = useCallback(() => setStreakBanner(null), []);

  const value = useMemo<QuestsValue>(
    () => ({ coins, state, lastCompletions, streakBanner, dismissStreakBanner, reportHand, refresh }),
    [coins, dismissStreakBanner, lastCompletions, reportHand, refresh, state, streakBanner],
  );

  return <QuestsContext.Provider value={value}>{children}</QuestsContext.Provider>;
}
