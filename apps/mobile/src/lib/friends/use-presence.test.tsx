import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { beat, goOffline } from "@/lib/friends/friends-client";
import { HEARTBEAT_MS, usePresence } from "./use-presence";

jest.mock("@/lib/friends/friends-client", () => ({ beat: jest.fn(), goOffline: jest.fn() }));
jest.mock("@/features/online/room-session", () => ({ useActiveRoomId: () => "room1" }));
const mockSession: { verified: boolean; refetch: jest.Mock } = { verified: false, refetch: jest.fn() };
jest.mock("@/auth/client/auth-client", () => ({
  authClient: { useSession: () => ({ data: { user: { emailVerified: mockSession.verified } }, refetch: mockSession.refetch }) },
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  mockSession.verified = false;
  jest.mocked(beat).mockResolvedValue({ invites: [], emailVerified: false });
  jest.mocked(goOffline).mockResolvedValue(undefined);
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });
  jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() });
});
afterEach(() => jest.useRealTimers());

test("beats at once and every interval, reporting the table it holds", async () => {
  await renderHook(() => usePresence(true));
  expect(beat).toHaveBeenCalledTimes(1);
  expect(beat).toHaveBeenCalledWith(true);
  await act(async () => { jest.advanceTimersByTime(HEARTBEAT_MS); });
  expect(beat).toHaveBeenCalledTimes(2);
});

test("keeps the latest invite until dismissed", async () => {
  jest.mocked(beat).mockResolvedValue({
    invites: [{ fromName: "Ada", roomId: "r1" }, { fromName: "Bea", roomId: "r2" }],
    emailVerified: false,
  });
  const { result } = await renderHook(() => usePresence(true));
  expect(result.current.invite).toEqual({ fromName: "Bea", roomId: "r2" });
  await act(async () => result.current.dismiss());
  expect(result.current.invite).toBeNull();
});

test("refreshes the session once the server reports an email verified on another device", async () => {
  await renderHook(() => usePresence(true));
  expect(mockSession.refetch).not.toHaveBeenCalled();
  jest.mocked(beat).mockResolvedValue({ invites: [], emailVerified: true });
  await act(async () => { jest.advanceTimersByTime(HEARTBEAT_MS); });
  expect(mockSession.refetch).toHaveBeenCalledTimes(1);
});

test("does not refetch a session that is already verified", async () => {
  mockSession.verified = true;
  jest.mocked(beat).mockResolvedValue({ invites: [], emailVerified: true });
  await renderHook(() => usePresence(true));
  expect(mockSession.refetch).not.toHaveBeenCalled();
});

test("a guest never beats", async () => {
  await renderHook(() => usePresence(false));
  expect(beat).not.toHaveBeenCalled();
});
