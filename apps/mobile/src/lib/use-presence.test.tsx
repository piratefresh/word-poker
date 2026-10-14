import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";

import { beat, goOffline } from "@/lib/friends-client";
import { HEARTBEAT_MS, usePresence } from "./use-presence";

jest.mock("@/lib/friends-client", () => ({ beat: jest.fn(), goOffline: jest.fn() }));
jest.mock("@/features/online/room-session", () => ({ useActiveRoomId: () => "room1" }));

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  jest.mocked(beat).mockResolvedValue([]);
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
  jest.mocked(beat).mockResolvedValue([{ fromName: "Ada", roomId: "r1" }, { fromName: "Bea", roomId: "r2" }]);
  const { result } = await renderHook(() => usePresence(true));
  expect(result.current.invite).toEqual({ fromName: "Bea", roomId: "r2" });
  await act(async () => result.current.dismiss());
  expect(result.current.invite).toBeNull();
});

test("a guest never beats", async () => {
  await renderHook(() => usePresence(false));
  expect(beat).not.toHaveBeenCalled();
});
