import { render } from "@testing-library/react-native";
import type { HistoryHand } from "@wordpoker/contracts";
import type { LocalHistoryHand } from "@/lib/history/history-store";
import { HandDetailPage } from "./hand-detail-page";

jest.mock("@/lib/history/history-provider", () => ({ useHistory: () => ({ uploadingSessionId: null }) }));
jest.mock("./ledger/mini-tile", () => ({ MiniTile: () => null }));
jest.mock("@/components/chip/chip-sprite", () => ({ ChipSprite: () => null }));
jest.mock("./history-word-review", () => ({ HistoryWordReview: () => null }));
jest.mock("./ledger/ledger-page", () => {
  const { Fragment } = jest.requireActual("react");
  return {
  LedgerList: ({ ListHeaderComponent, ListFooterComponent, data, renderItem }: {
    ListHeaderComponent: React.ReactNode; ListFooterComponent: React.ReactNode;
    data: { key: string }[]; renderItem: (info: { item: { key: string }; index: number }) => React.ReactNode;
  }) => <>{ListHeaderComponent}{data.map((item, index) => <Fragment key={item.key}>{renderItem({ item, index })}</Fragment>)}{ListFooterComponent}</>,
  };
});

const hand: HistoryHand = {
  id: "s:1", sessionId: "s", handNo: 1, mode: "offline", ranked: false,
  heroId: "hero", dictionaryId: "en_US-large", startedAtMs: 1000, endedAtMs: 2000,
  seats: [{ playerId: "hero", name: "You", initialStack: 1000 }, { playerId: "bot", name: "Mira", initialStack: 1000 }],
  actions: [{ sequence: 0, atMs: 1200, source: "player", action: { type: "fold", playerId: "hero" } }],
  summary: { outcome: "fold-out", community: [], pots: [{ amount: 40, eligible: ["bot"], winners: ["bot"] }], seats: [
    { playerId: "hero", privateTiles: [], word: null, score: 0, submission: null, reason: null, place: null, finalStack: 980 },
    { playerId: "bot", privateTiles: [], word: null, score: 0, submission: null, reason: null, place: 1, finalStack: 1020 },
  ] },
};

test.each([
  ["online", "synced", "RECORDED BY SERVER"],
  ["offline", "pending", "ON DEVICE · UNRANKED"],
  ["offline", "synced", "VERIFIED · UNRANKED"],
  ["offline", "rejected", "UPLOAD REJECTED · UNRANKED"],
] as const)("detail renders %s/%s and groups each seat's result", async (mode, status, badge) => {
  const row: LocalHistoryHand = { hand: { ...hand, mode }, status, error: status === "rejected" ? "Replay mismatch" : null, record: null, attempts: 0, retryAtMs: 0 };
  const view = await render(<HandDetailPage row={row} loading={false} active={false} back={jest.fn()} />);
  expect(view.getByText("HAND #1")).toBeOnTheScreen();
  expect(view.getByText(badge)).toBeOnTheScreen();
  expect(view.getByLabelText("You, folded, lost 20 chips, stack 1000 to 980")).toBeOnTheScreen();
  expect(view.getByLabelText(/Mira.*won 20 chips.*pot won 40/)).toBeOnTheScreen();
  expect(view.getByRole("button", { name: "Back to hands" })).toBeOnTheScreen();
  if (status === "rejected") expect(view.getByText("Replay mismatch")).toBeOnTheScreen();
});

test("empty and loading detail keep a usable back control", async () => {
  const view = await render(<HandDetailPage row={null} loading active={false} back={jest.fn()} />);
  expect(view.getByText("Opening saved hand…")).toBeOnTheScreen();
  await view.rerender(<HandDetailPage row={null} loading={false} active={false} back={jest.fn()} />);
  expect(view.getByText("This hand is not saved on this device.")).toBeOnTheScreen();
  expect(view.getByRole("button", { name: "Back to hands" })).toBeOnTheScreen();
});
