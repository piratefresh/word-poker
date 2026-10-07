import { act, renderHook, waitFor } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";
import { fetchQuestState, fetchWallet, sendQuestHandClaim } from "@/lib/wallet-client";
import { QuestsProvider, useQuests } from "@/lib/quests-provider";

jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: jest.fn() } }));
jest.mock("@/lib/wallet-client", () => ({
  fetchQuestState: jest.fn(),
  fetchWallet: jest.fn(),
  sendQuestHandClaim: jest.fn(),
}));

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

function signedIn(emailVerified = true) {
  useSession.mockReturnValue({ data: { user: { id: "user_1", emailVerified } } } as never);
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
  jest.resetAllMocks();
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
    questState.mockResolvedValue({ streak: { current: 3, creditedToday: 100 }, quests: [] });
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
