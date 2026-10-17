import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useSessionHands } from "./use-history-pages";

let mockRevision = 0;
let mockOwner = "a";
jest.mock("./history-provider", () => ({ useHistory: () => ({ ownerId: mockOwner, revision: mockRevision }) }));
const mockPage = jest.fn();
jest.mock("./history-store", () => ({
  ...jest.requireActual("./history-store"),
  sessionHands: (...args: unknown[]) => mockPage(...args),
}));

const row = (n: number) => ({ hand: { sessionId: "s", handNo: n, endedAtMs: 1000 - n } }) as never;
// Newest first, like the store: handNo 0..N-1.
const rows = Array.from({ length: 45 }, (_, n) => row(n));
beforeEach(() => {
  mockRevision = 0;
  mockOwner = "a";
  mockPage.mockReset().mockImplementation(async (_o: string, _s: string, after: { id: string } | null, limit: number) => {
    const start = after ? Number(after.id.split(":")[1]) + 1 : 0;
    return rows.slice(start, start + limit);
  });
});

test("an account switch hides old rows immediately and ignores its late read", async () => {
  let resolveOld: (rows: unknown[]) => void = () => {};
  mockPage.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
  const { result, rerender } = await renderHook(() => useSessionHands("s"));
  mockOwner = "b";
  mockPage.mockResolvedValueOnce([row(99)]);
  await rerender({});
  await waitFor(() => expect(result.current.items).toEqual([row(99)]));
  await act(async () => resolveOld(rows));
  expect(result.current.items).toEqual([row(99)]);
});

test("loads a page, appends the next on demand, and stops at the end", async () => {
  const { result } = await renderHook(() => useSessionHands("s"));
  await waitFor(() => expect(result.current.items).toHaveLength(20));
  await act(async () => { result.current.loadMore(); result.current.loadMore(); });
  await waitFor(() => expect(result.current.items).toHaveLength(40));
  expect(mockPage).toHaveBeenCalledTimes(2);
  await act(async () => { result.current.loadMore(); });
  await waitFor(() => expect(result.current.items).toHaveLength(45));
  await act(async () => { result.current.loadMore(); });
  expect(mockPage).toHaveBeenCalledTimes(3);
});

test("a revision bump re-reads every loaded row instead of snapping back to one page", async () => {
  const { result, rerender } = await renderHook(() => useSessionHands("s"));
  await waitFor(() => expect(result.current.items).toHaveLength(20));
  await act(async () => { result.current.loadMore(); });
  await waitFor(() => expect(result.current.items).toHaveLength(40));
  mockRevision = 1;
  await rerender({});
  await waitFor(() => expect(mockPage).toHaveBeenLastCalledWith("a", "s", null, 40));
  await waitFor(() => expect(result.current.items).toHaveLength(40));
});
