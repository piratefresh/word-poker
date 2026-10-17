import { act, renderHook, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

import { authClient } from "@/auth/client/auth-client";
import { readItem, writeItem } from "@/lib/storage/claim-store";
import { fetchQuestState, fetchWallet, QuestClaimRejectedError, sendQuestHandClaim } from "@/lib/wallet/wallet-client";
import { QuestsProvider, useQuests } from "@/lib/quests/quests-provider";

jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: jest.fn() } }));
jest.mock("@/lib/wallet/wallet-client", () => ({
  fetchQuestState: jest.fn(),
  fetchWallet: jest.fn(),
  sendQuestHandClaim: jest.fn(),
  QuestClaimRejectedError: class QuestClaimRejectedError extends Error {},
}));
// The device store, in memory — it outlives a remount the way the disk outlives an app restart.
jest.mock("@/lib/storage/claim-store", () => {
  const disk = new Map<string, string>();
  return {
    readItem: jest.fn((key: string) => disk.get(key) ?? null),
    writeItem: jest.fn((key: string, value: string) => disk.set(key, value)),
    clear: () => disk.clear(),
  };
});

const useSession = jest.mocked(authClient.useSession);
const questState = jest.mocked(fetchQuestState);
const wallet = jest.mocked(fetchWallet);
const claim = jest.mocked(sendQuestHandClaim);

const EMPTY_STATE = { streak: { current: 0, creditedToday: null }, xp: 0, level: 1, quests: [] };
const FACTS = {
  revealed: true,
  heroWon: true,
  heroWord: "CAT",
  heroScore: 12,
  heroDecidedBy: "final-score" as const,
  pot: 300,
  wildTable: false,
  heroUsedPower: false,
};

function signedIn(emailVerified = true, id = "user_1") {
  useSession.mockReturnValue({ data: { user: { id, emailVerified } } } as never);
}

function storedClaims(): { userId: string; handToken: string }[] {
  return JSON.parse(readItem("quest-claims") ?? "[]");
}

function signedOut() {
  useSession.mockReturnValue({ data: null } as never);
}

function hook() {
  // `renderHook` resolves once the initial render settles — awaited at every call site.
  return renderHook(() => useQuests(), {
    wrapper: ({ children }) => <QuestsProvider>{children}</QuestsProvider>,
  });
}

beforeEach(() => {
  (jest.requireMock("@/lib/storage/claim-store") as { clear: () => void }).clear();
  jest.clearAllMocks();
  claim.mockReset();
  questState.mockReset();
  wallet.mockReset();
  useSession.mockReset();
  questState.mockResolvedValue(EMPTY_STATE);
  wallet.mockResolvedValue({ coins: 1000, welcomed: true });
});

describe("QuestsProvider", () => {
  test("reads nothing while signed out", async () => {
    signedOut();
    const { result } = await hook();

    expect(result.current.coins).toBeNull();
    expect(questState).not.toHaveBeenCalled();

    await act(() => reportHandNoop());
    expect(claim).not.toHaveBeenCalled();
  });

  test("reads nothing while signed in but unverified", async () => {
    signedIn(false);
    await hook();

    await act(() => reportHandNoop());
    expect(questState).not.toHaveBeenCalled();
    expect(wallet).not.toHaveBeenCalled();
  });

  test("reads the streak and wallet once signed in and verified", async () => {
    signedIn();
    const { result } = await hook();

    await waitFor(() => expect(result.current.coins).toBe(1000));
    expect(result.current.state).toEqual(EMPTY_STATE);
  });

  test("shows the streak banner when the read credits today, and dismiss clears it", async () => {
    questState.mockResolvedValue({ ...EMPTY_STATE, streak: { current: 3, creditedToday: 100 }, quests: [] });
    signedIn();
    const { result } = await hook();

    await waitFor(() => expect(result.current.streakBanner).toEqual({ day: 3, reward: 100 }));

    await act(() => result.current.dismissStreakBanner());
    expect(result.current.streakBanner).toBeNull();
  });

  test("reportHand sends a claim and reconciles completions and the balance", async () => {
    claim.mockResolvedValue({ completed: ["win-word-3"], duplicate: false, xp: 37, level: 1 });
    wallet.mockResolvedValueOnce({ coins: 1000, welcomed: true }).mockResolvedValueOnce({ coins: 1075, welcomed: true });
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.coins).toBe(1000));

    await act(() => result.current.reportHand(FACTS));

    await waitFor(() => expect(result.current.lastCompletions).toEqual(["win-word-3"]));
    expect(result.current.coins).toBe(1075);
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ facts: FACTS }));
  });

  test("reportHand names the claim, freezes the XP baseline, and files the server's answer under its token", async () => {
    questState.mockResolvedValue({ ...EMPTY_STATE, xp: 40 });
    let answer!: (value: { completed: never[]; duplicate: boolean; xp: number; level: number }) => void;
    claim.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    claim.mockImplementation(() => new Promise(() => {}));
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.state?.xp).toBe(40));

    let first: ReturnType<typeof result.current.reportHand> = null;
    await act(() => { first = result.current.reportHand(FACTS); });
    expect(first).toEqual({ handToken: expect.any(String), baselineXp: 40 });

    // The first claim is still unanswered (offline), so the next hand's baseline includes it: 10 + 15 + 12.
    let second: ReturnType<typeof result.current.reportHand> = null;
    await act(() => { second = result.current.reportHand(FACTS); });
    expect(second).toEqual({ handToken: expect.any(String), baselineXp: 77 });
    expect(result.current.claimOutcomes).toEqual({});

    await act(async () => answer({ completed: [], duplicate: false, xp: 77, level: 1 }));
    expect(result.current.claimOutcomes).toEqual({ [first!.handToken]: { status: "confirmed", xp: 77, level: 1 } });
  });

  test("an unreadable claim is filed as rejected; signed out reports nothing", async () => {
    claim.mockRejectedValue(new QuestClaimRejectedError());
    signedIn();
    const { result } = await hook();
    let report: ReturnType<typeof result.current.reportHand> = null;
    await act(() => { report = result.current.reportHand(FACTS); });
    await waitFor(() => expect(result.current.claimOutcomes[report!.handToken]).toEqual({ status: "rejected" }));

    signedOut();
    const out = await hook();
    expect(out.result.current.reportHand(FACTS)).toBeNull();
  });

  test("a level-up claim patches the standing and fires the celebration once", async () => {
    const state = (xp: number, level: number) => ({ streak: { current: 0, creditedToday: null }, xp, level, quests: [] });
    // One reply per GET: the initial read, the refetch after each of the two claims.
    questState
      .mockResolvedValueOnce(state(90, 1))
      .mockResolvedValueOnce(state(112, 2))
      .mockResolvedValue(state(134, 2));
    claim
      .mockResolvedValueOnce({ completed: [], duplicate: false, xp: 112, level: 2 })
      .mockResolvedValue({ completed: [], duplicate: false, xp: 134, level: 2 });
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.state?.level).toBe(1));

    await act(() => result.current.reportHand(FACTS));

    await waitFor(() => expect(result.current.levelUp).toEqual({ level: 2, reward: 100 }));
    expect(result.current.state?.xp).toBe(112);
    expect(result.current.state?.level).toBe(2);

    await act(() => result.current.reportHand(FACTS));

    await waitFor(() => expect(result.current.state?.xp).toBe(134));
    expect(result.current.levelUp).toEqual({ level: 2, reward: 100 });

    await act(() => result.current.dismissLevelUp());
    expect(result.current.levelUp).toBeNull();
  });

  test("reportHand is a no-op for a null facts (no hero seat)", async () => {
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.coins).toBe(1000));

    await act(() => result.current.reportHand(null));

    expect(claim).not.toHaveBeenCalled();
  });

  test("an unsent claim survives a remount and is flushed on mount", async () => {
    claim.mockRejectedValueOnce(new Error("network"));
    signedIn();
    const first = await hook();
    await waitFor(() => expect(first.result.current.coins).toBe(1000));
    await act(() => first.result.current.reportHand(FACTS));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    expect(storedClaims()).toHaveLength(1);

    claim.mockResolvedValue({ completed: [], duplicate: false, xp: 10, level: 1 });
    await hook(); // a fresh provider: all it knows is what the disk kept

    await waitFor(() => expect(claim).toHaveBeenCalledTimes(2));
    expect(claim.mock.calls[1]![0]).toEqual(claim.mock.calls[0]![0]); // same handToken: deduped server-side
    await waitFor(() => expect(storedClaims()).toEqual([]));
  });

  test("another account’s stored claim is not sent, and is sent once that account is back", async () => {
    writeItem("quest-claims", JSON.stringify([{ userId: "user_a", handToken: "t1", facts: FACTS }]));
    claim.mockResolvedValue({ completed: [], duplicate: false, xp: 10, level: 1 });
    signedIn(true, "user_b");
    const { result, rerender } = await hook();
    await waitFor(() => expect(result.current.coins).toBe(1000));
    expect(claim).not.toHaveBeenCalled();

    signedOut();
    await rerender({});
    signedIn(true, "user_a");
    await rerender({});

    await waitFor(() => expect(claim).toHaveBeenCalledWith({ handToken: "t1", facts: FACTS }));
    await waitFor(() => expect(storedClaims()).toEqual([]));
  });

  test("a claim the server rejects with 400 is dropped, not retried", async () => {
    claim.mockRejectedValueOnce(new QuestClaimRejectedError());
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.coins).toBe(1000));

    await act(() => result.current.reportHand(FACTS));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(storedClaims()).toEqual([]));
  });

  test("a failed claim is sent when the app returns to the foreground", async () => {
    const listen = jest.spyOn(AppState, "addEventListener");
    claim.mockRejectedValueOnce(new Error("network"));
    claim.mockResolvedValue({ completed: [], duplicate: false, xp: 10, level: 1 });
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.coins).toBe(1000));
    await act(() => result.current.reportHand(FACTS));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));

    const onChange = listen.mock.calls.at(-1)![1];
    await act(() => onChange("active"));

    await waitFor(() => expect(claim).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(storedClaims()).toEqual([]));
  });

  test("a failed claim is queued and retried on the next reportHand", async () => {
    claim.mockResolvedValue({ completed: [], duplicate: false, xp: 0, level: 1 });
    claim.mockRejectedValueOnce(new Error("network"));
    signedIn();
    const { result } = await hook();
    await waitFor(() => expect(result.current.coins).toBe(1000));

    await act(() => result.current.reportHand(FACTS));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(1));

    await act(() => result.current.reportHand(FACTS));
    await waitFor(() => expect(claim).toHaveBeenCalledTimes(3), undefined); // the retry, then the new claim
  });
});

async function reportHandNoop(): Promise<void> {
  // Lets pending microtasks settle in tests that assert nothing was fetched.
  await Promise.resolve();
}
