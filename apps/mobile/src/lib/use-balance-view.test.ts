/**
 * use-balance-view.test.ts — the online felt's Wallet read (STO-562).
 *
 * The hook's whole job is keeping the ways of not knowing a figure separate, so each
 * terminal state of `GET /api/wallet` is read back through the view.
 */

import { renderHook, waitFor } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";
import { fetchWallet, WalletAuthError, WalletUnverifiedError } from "@/lib/wallet-client";

import { useBalanceView } from "./use-balance-view";

// The hook reads the session through the auth client, so the suite hands it one.
jest.mock("@/auth/client/auth-client", () => ({ authClient: { useSession: jest.fn() } }));

// `instanceof` decides the signed-out read, so the error classes stay real; only the fetch
// itself is stood in.
jest.mock("@/lib/wallet-client", () => ({
  WalletAuthError: class extends Error {},
  WalletUnverifiedError: class extends Error {},
  fetchWallet: jest.fn(),
}));

const useSession = jest.mocked(authClient.useSession);
const wallet = jest.mocked(fetchWallet);

/** The session hook's answer: no user means no session, `pending` means it is still resolving. */
function sessionOf(pending: boolean, userId?: string) {
  useSession.mockReturnValue({
    data: userId ? { user: { id: userId } } : null,
    isPending: pending,
  } as never);
}

beforeEach(() => {
  jest.resetAllMocks();
});

test("waits for the session's own answer before asking the Wallet anything", async () => {
  sessionOf(true);
  const { result } = await renderHook(() => useBalanceView());

  expect(result.current).toEqual({ state: "loading" });
  expect(wallet).not.toHaveBeenCalled();
});

test("a signed-out player reads signed-out, and the Wallet is never asked", async () => {
  sessionOf(false);
  const { result } = await renderHook(() => useBalanceView());

  expect(result.current).toEqual({ state: "signed-out" });
  expect(wallet).not.toHaveBeenCalled();
});

test("reads the signed-in player's coins", async () => {
  wallet.mockResolvedValue({ coins: 5000, welcomed: true });
  sessionOf(false, "user_1");
  // `renderHook` resolves with effects already flushed, so the intermediate loading read is
  // the settled-hand test's to catch, on its refetch.
  const { result } = await renderHook(() => useBalanceView());

  await waitFor(() => expect(result.current).toEqual({ state: "ready", amount: 5000 }));
  expect(wallet).toHaveBeenCalledTimes(1);
});

test("a refused session (401) reads signed-out", async () => {
  wallet.mockRejectedValue(new WalletAuthError());
  sessionOf(false, "user_1");
  const { result } = await renderHook(() => useBalanceView());

  await waitFor(() => expect(result.current).toEqual({ state: "signed-out" }));
});

test("an unverified email (403) reads unavailable, never a figure", async () => {
  wallet.mockRejectedValue(new WalletUnverifiedError("Verify your email to see your coins."));
  sessionOf(false, "user_1");
  const { result } = await renderHook(() => useBalanceView());

  await waitFor(() => expect(result.current).toEqual({ state: "unavailable" }));
});

test("any other failure reads unavailable too", async () => {
  wallet.mockRejectedValue(new Error("network down"));
  sessionOf(false, "user_1");
  const { result } = await renderHook(() => useBalanceView());

  await waitFor(() => expect(result.current).toEqual({ state: "unavailable" }));
});

test("a settled hand re-reads the balance", async () => {
  wallet
    .mockResolvedValueOnce({ coins: 5000, welcomed: true })
    .mockResolvedValueOnce({ coins: 4400, welcomed: true });
  sessionOf(false, "user_1");
  const { result, rerender } = await renderHook(
    (initial: { settleKey: string | null }) => useBalanceView(initial.settleKey),
    { initialProps: { settleKey: "1:live" } },
  );
  await waitFor(() => expect(result.current).toEqual({ state: "ready", amount: 5000 }));

  // The felt marks the hand paid at payout, and the read follows it.
  rerender({ settleKey: "1:paid" });
  await waitFor(() => expect(result.current).toEqual({ state: "ready", amount: 4400 }));
  expect(wallet).toHaveBeenCalledTimes(2);
});

test("a new session's player re-reads the Wallet", async () => {
  wallet
    .mockResolvedValueOnce({ coins: 100, welcomed: true })
    .mockResolvedValueOnce({ coins: 200, welcomed: true });
  sessionOf(false, "user_1");
  // The props only give `rerender` something to carry; the read follows the session mock.
  const { result, rerender } = await renderHook(
    (_props: { settleKey: string | null }) => useBalanceView(),
    { initialProps: { settleKey: null } },
  );
  await waitFor(() => expect(result.current).toEqual({ state: "ready", amount: 100 }));

  sessionOf(false, "user_2");
  rerender({ settleKey: null });
  await waitFor(() => expect(result.current).toEqual({ state: "ready", amount: 200 }));
  expect(wallet).toHaveBeenCalledTimes(2);
});
