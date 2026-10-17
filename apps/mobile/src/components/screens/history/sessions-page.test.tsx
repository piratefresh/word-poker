import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import type { HistorySession } from "@/lib/history/history-store";

import { SessionCard, SessionsPage, SyncPill, offlineBanner, syncLabel } from "./sessions-page";

const mockRefresh = jest.fn();
let mockHistory = {
  offline: false,
  syncing: false,
  lastSyncedAt: null as number | null,
  uploadingSessionId: null as string | null,
  pendingSessions: 0,
  error: null,
  refresh: mockRefresh,
};
let mockLoading = true;
jest.mock("@/lib/history/history-provider", () => ({
  useHistory: () => mockHistory,
}));
jest.mock("@/lib/history/use-history-pages", () => ({
  useHistorySessions: () => ({
    items: [],
    loading: mockLoading,
    loadMore: jest.fn(),
  }),
}));
jest.mock("expo-router", () => ({ router: { navigate: jest.fn() } }));
jest.mock("./ledger/mini-tile", () => ({ MiniTile: () => null }));
jest.mock("./ledger/ledger-page", () => ({
  LedgerList: ({
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    ListHeaderComponent: React.ReactNode;
    ListEmptyComponent: React.ReactNode;
  }) => (
    <>
      {ListHeaderComponent}
      {ListEmptyComponent}
    </>
  ),
}));

const session = (mode: "offline" | "online" = "offline"): HistorySession => ({
  sessionId: "s",
  startedAtMs: 1000,
  endedAtMs: 2000,
  hands: 3,
  pending: false,
  rejected: [],
  latest: {
    hand: {
      id: "s:3",
      sessionId: "s",
      handNo: 3,
      mode,
      ranked: mode === "online",
      startedAtMs: 1000,
      endedAtMs: 2000,
      dictionaryId: "en_US-large",
      heroId: "hero",
      seats: [],
      actions: [],
      summary: { outcome: "fold-out", community: [], seats: [], pots: [] },
    },
    status: "synced",
    error: null,
    record: null,
    attempts: 0,
    retryAtMs: 0,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLoading = true;
  mockHistory = {
    offline: false,
    syncing: false,
    lastSyncedAt: null,
    uploadingSessionId: null,
    pendingSessions: 0,
    error: null,
    refresh: mockRefresh,
  };
});

test("offline banner counts sessions with singular and plural copy", () => {
  expect(offlineBanner(0)).toBe("You're offline. Saved hands are still here.");
  expect(offlineBanner(1)).toContain("1 session will upload");
  expect(offlineBanner(3)).toContain("3 sessions will upload");
  expect(syncLabel(false, false, false, 0, 120000)).toBe("Synced 2 minutes ago. Double tap to sync.");
  expect(syncLabel(false, false, false, null)).toBe("Not synced yet. Double tap to sync.");
  expect(syncLabel(false, false, true, 0)).toBe("Last sync failed. Double tap to retry.");
});

test("sync is tappable only when connected and idle", async () => {
  const view = await render(<SyncPill />);
  await fireEvent.press(view.getByTestId("history-sync"));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  mockHistory = { ...mockHistory, syncing: true };
  await view.rerender(<SyncPill />);
  expect(view.getByText("SYNCING…")).toBeOnTheScreen();
  expect(view.getByTestId("history-sync")).toBeDisabled();
  mockHistory = { ...mockHistory, offline: true };
  await view.rerender(<SyncPill />);
  expect(view.getByText("OFFLINE")).toBeOnTheScreen();
  expect(view.getByTestId("history-sync")).toBeDisabled();
});

test("rejected details toggle without opening the session and show the stored reason while offline sessions stay unranked", async () => {
  const open = jest.fn();
  const toggle = jest.fn();
  const rejected = {
    ...session(),
    rejected: [{ handNo: 1, reason: "Replay did not match." }],
  };
  const view = await render(
    <SessionCard
      session={rejected}
      uploadingSessionId={null}
      expanded={false}
      open={open}
      toggle={toggle}
    />,
  );
  expect(view.getByText("UNRANKED")).toBeOnTheScreen();
  await fireEvent.press(view.getByRole("button", { name: "1 hand rejected · Details" }));
  expect(toggle).toHaveBeenCalledTimes(1);
  expect(open).not.toHaveBeenCalled();
  await view.rerender(
    <SessionCard
      session={rejected}
      uploadingSessionId={null}
      expanded
      open={open}
      toggle={toggle}
    />,
  );
  expect(view.getByText("Hand #1: Replay did not match.")).toBeOnTheScreen();
  expect(view.getByText("Hide details")).toBeOnTheScreen();
  await view.rerender(
    <SessionCard
      session={session("online")}
      uploadingSessionId={null}
      expanded={false}
      open={open}
      toggle={toggle}
    />,
  );
  expect(view.queryByText("UNRANKED")).toBeNull();
});

test("shows three placeholders until hydrated, then a working offline entry; reconnect removes the banner", async () => {
  const view = await render(<SessionsPage active={false} openSession={jest.fn()} />);
  expect(view.getAllByTestId("session-placeholder")).toHaveLength(3);
  expect(view.queryByText("No hands yet")).toBeNull();
  mockLoading = false;
  mockHistory = { ...mockHistory, offline: true, pendingSessions: 3 };
  await view.rerender(<SessionsPage active={false} openSession={jest.fn()} />);
  expect(view.getByText("No hands yet")).toBeOnTheScreen();
  expect(view.getByText(offlineBanner(3))).toBeOnTheScreen();
  await fireEvent.press(view.getByRole("button", { name: "Play offline" }));
  expect(router.navigate).toHaveBeenCalledWith({
    pathname: "/",
    params: { offline: "1" },
  });
  mockHistory = { ...mockHistory, offline: false };
  await view.rerender(<SessionsPage active={false} openSession={jest.fn()} />);
  expect(view.queryByText(offlineBanner(3))).toBeNull();
});
