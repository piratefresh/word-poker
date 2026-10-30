/**
 * quests-provider.tsx — the signed-in player's quest state, held once for the app (STO-525, STO-543).
 *
 * Mounted once in `src/app/_layout.tsx`, beside the session it follows: signed out, or signed in
 * but not yet email-verified, it holds nothing and sends nothing (`wallet-client.ts`'s own
 * `WalletUnverifiedError` is the server saying the same thing, this just never asks). `reportHand`
 * is the one way a table tells it about a settled hand — minted a token so a retried claim is
 * safe — and `refresh` is what re-reads the streak and quest state (the quests screen's own pull).
 *
 * XP and level ride the same responses: a claim response carries the totals its hand produced,
 * so the provider patches them in ahead of the next full read. A level-up — a response, or a
 * `refresh`, whose level is higher than the last one seen — sets `levelUp` for the home screen's
 * celebration, once per crossing: `levelRef` moves in the same handlers that move the state, so
 * two claims answered together cannot both celebrate the same level.
 *
 * A claim is written to the device (`claim-store`) before it is sent and dropped once the server
 * answers 200 (a duplicate included) or 400 (unreadable, so never retried); anything else keeps it.
 * Stored claims carry their account and are flushed only under it — on authorizing, on returning
 * to the foreground, and on each `reportHand` — so a hand settled offline earns its XP later.
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
import { AppState } from "react-native";

import { isAccountEligible, type QuestHandFacts, type QuestId, type QuestStateResponse } from "@wordpoker/contracts";
import { levelReward, xpForHand } from "@wordpoker/game-rules";

import { authClient } from "@/auth/client/auth-client";
import { readItem, writeItem } from "@/lib/storage/claim-store";
import { fetchQuestState, fetchWallet, QuestClaimRejectedError, sendQuestHandClaim } from "@/lib/wallet/wallet-client";

/** A streak reward paid by the most recent read — what the home banner announces. */
export interface StreakBanner {
  readonly day: number;
  readonly reward: number;
}

/** A reached level and the coins its crossing paid — what the home celebration announces. */
export interface LevelUpBanner {
  readonly level: number;
  readonly reward: number;
}

/** The coins levels `from + 1` through `to` paid, for a jump that crossed more than one. */
function crossingReward(from: number, to: number): number {
  let reward = 0;
  for (let level = from + 1; level <= to; level += 1) reward += levelReward(level);

  return reward;
}

/** How the server answered one claim: its totals (a duplicate included), or "never" (unreadable). */
export type ClaimOutcome =
  | { readonly status: "confirmed"; readonly xp: number; readonly level: number }
  | { readonly status: "rejected" };

/**
 * What `reportHand` hands back for the hand it queued (STO-573): the claim's token, to find its
 * outcome by, and the XP the account stood at the moment of the report — the confirmed total plus
 * every earlier claim still waiting — or `null` before the first read lands.
 */
export interface HandReport {
  readonly handToken: string;
  readonly baselineXp: number | null;
}

export interface QuestsValue {
  /** The Wallet's balance, read alongside quest state; `null` until the first read lands. */
  readonly coins: number | null;
  readonly state: QuestStateResponse | null;
  /** What the most recently answered claim completed; cleared by the next `reportHand`. */
  readonly lastCompletions: readonly QuestId[];
  readonly streakBanner: StreakBanner | null;
  readonly dismissStreakBanner: () => void;
  /** The most recent level-up; set once per crossing, cleared by the next dismissal. */
  readonly levelUp: LevelUpBanner | null;
  readonly dismissLevelUp: () => void;
  /** Outcomes of claims answered this session, by hand token — unanswered claims have none. */
  readonly claimOutcomes: Readonly<Record<string, ClaimOutcome>>;
  /**
   * Reports one settled hand's quest facts. A `null` (no hero seat) is a no-op, and so is a
   * signed-out or unverified account: both return `null`, nothing was queued.
   */
  readonly reportHand: (facts: QuestHandFacts | null) => HandReport | null;
  /** Re-reads the streak and quest state — the quests screen's own pull on mount. */
  readonly refresh: () => void;
  /**
   * Re-reads only the Wallet's coins — the lobby's pull, after a purchase or a cash-out. Resolves
   * with the coins read, or null when the read failed.
   */
  readonly refreshCoins: () => Promise<number | null>;
}

const DEFAULT_VALUE: QuestsValue = {
  coins: null,
  state: null,
  lastCompletions: [],
  streakBanner: null,
  dismissStreakBanner: () => {},
  levelUp: null,
  dismissLevelUp: () => {},
  claimOutcomes: {},
  reportHand: () => null,
  refresh: () => {},
  refreshCoins: async () => null,
};

const QuestsContext = createContext<QuestsValue>(DEFAULT_VALUE);

export function useQuests(): QuestsValue {
  return useContext(QuestsContext);
}

interface QueuedClaim {
  readonly userId: string;
  readonly handToken: string;
  readonly facts: QuestHandFacts;
}

const CLAIMS_KEY = "quest-claims";
// ponytail: a flat cap, oldest dropped first — ~200 hands is days of offline play; move into
// STO-457's outbox (one row per hand) if anyone ever plays that long without a connection.
const MAX_QUEUED_CLAIMS = 200;

function readClaims(): QueuedClaim[] {
  try {
    const stored: unknown = JSON.parse(readItem(CLAIMS_KEY) ?? "[]");
    return Array.isArray(stored) ? (stored as QueuedClaim[]) : [];
  } catch {
    return [];
  }
}

function writeClaims(claims: readonly QueuedClaim[]): void {
  writeItem(CLAIMS_KEY, JSON.stringify(claims.slice(-MAX_QUEUED_CLAIMS)));
}

function dropClaim(handToken: string): void {
  writeClaims(readClaims().filter((claim) => claim.handToken !== handToken));
}

/** A fresh id per claim — a dedupe key, not a secret, so a retry under the same one is safe. */
function mintHandToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function QuestsProvider({ children }: { children: ReactNode }): ReactElement {
  const { data: session } = authClient.useSession();
  const authorized = isAccountEligible(session?.user);
  const userId = authorized ? (session?.user.id ?? null) : null;

  const [coins, setCoins] = useState<number | null>(null);
  const [state, setState] = useState<QuestStateResponse | null>(null);
  const [lastCompletions, setLastCompletions] = useState<readonly QuestId[]>([]);
  const [streakBanner, setStreakBanner] = useState<StreakBanner | null>(null);
  const [levelUp, setLevelUp] = useState<LevelUpBanner | null>(null);
  const [claimOutcomes, setClaimOutcomes] = useState<Readonly<Record<string, ClaimOutcome>>>({});
  // The highest level this session has seen — moved in the handlers that move `state`, so a
  // celebration always compares against the level the player last actually had (null = unknown).
  const levelRef = useRef<number | null>(null);
  // Stored claims with a request out — so overlapping flushes don't send one twice.
  const inFlight = useRef(new Set<string>());

  const readWallet = useCallback(
    () =>
      fetchWallet()
        .then((wallet) => {
          setCoins(wallet.coins);
          return wallet.coins;
        })
        .catch(() => null),
    [],
  );

  const refresh = useCallback(() => {
    fetchQuestState()
      .then((next) => {
        const previous = levelRef.current;
        levelRef.current = next.level;
        setState(next);
        if (next.streak.creditedToday !== null) {
          setStreakBanner({ day: next.streak.current, reward: next.streak.creditedToday });
        }
        // A level the server paid while we were away (the heal on GET) celebrates here.
        if (previous !== null && next.level > previous) {
          setLevelUp({ level: next.level, reward: crossingReward(previous, next.level) });
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
      setLevelUp(null);
      setClaimOutcomes({});
      levelRef.current = null;
      return;
    }

    refresh();
  }, [authorized, refresh]);

  const send = useCallback(
    (claim: QueuedClaim) => {
      inFlight.current.add(claim.handToken);
      sendQuestHandClaim({ handToken: claim.handToken, facts: claim.facts })
        .then((result) => {
          dropClaim(claim.handToken);
          setClaimOutcomes((current) => ({
            ...current,
            [claim.handToken]: { status: "confirmed", xp: result.xp, level: result.level },
          }));
          const previous = levelRef.current;
          levelRef.current = Math.max(previous ?? 0, result.level);
          if (result.duplicate) return;

          setState((current) => (current ? { ...current, xp: result.xp, level: result.level } : current));
          if (previous !== null && result.level > previous) {
            setLevelUp({ level: result.level, reward: crossingReward(previous, result.level) });
          }
          if (result.completed.length > 0) setLastCompletions(result.completed);
          readWallet();
          fetchQuestState()
            .then(setState)
            .catch(() => {});
        })
        .catch((error: unknown) => {
          // Unreadable never succeeds; offline, 5xx, 401 and 403 stay stored for a later flush.
          if (error instanceof QuestClaimRejectedError) {
            dropClaim(claim.handToken);
            setClaimOutcomes((current) => ({ ...current, [claim.handToken]: { status: "rejected" } }));
          }
        })
        .finally(() => inFlight.current.delete(claim.handToken));
    },
    [readWallet],
  );

  const flush = useCallback(() => {
    if (userId === null) return;
    for (const claim of readClaims()) {
      if (claim.userId === userId && !inFlight.current.has(claim.handToken)) send(claim);
    }
  }, [send, userId]);

  // Authorizing (app start, sign-in) and every return to the foreground send what is stored.
  useEffect(() => {
    if (userId === null) return;
    flush();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") flush();
    });

    return () => subscription.remove();
  }, [flush, userId]);

  const reportHand = useCallback(
    (facts: QuestHandFacts | null): HandReport | null => {
      if (userId === null || facts === null) return null;

      // Frozen before this claim joins the queue, so a later hand's preview starts above it.
      const queuedXp = readClaims()
        .filter((claim) => claim.userId === userId)
        .reduce((sum, claim) => sum + xpForHand(claim.facts), 0);
      const baselineXp = state === null ? null : state.xp + queuedXp;
      const handToken = mintHandToken();
      writeClaims([...readClaims(), { userId, handToken, facts }]);
      flush();

      return { handToken, baselineXp };
    },
    [flush, state, userId],
  );

  const dismissStreakBanner = useCallback(() => setStreakBanner(null), []);
  const dismissLevelUp = useCallback(() => setLevelUp(null), []);

  const value = useMemo<QuestsValue>(
    () => ({
      coins,
      state,
      lastCompletions,
      streakBanner,
      dismissStreakBanner,
      levelUp,
      dismissLevelUp,
      claimOutcomes,
      reportHand,
      refresh,
      refreshCoins: readWallet,
    }),
    [claimOutcomes, coins, dismissLevelUp, dismissStreakBanner, lastCompletions, levelUp, readWallet, reportHand, refresh, state, streakBanner],
  );

  return <QuestsContext.Provider value={value}>{children}</QuestsContext.Provider>;
}
