import { fireEvent, render } from "@testing-library/react-native";

import type { HistoryHand } from "@wordpoker/contracts";

import type { HistorySession, LocalHistoryHand } from "@/lib/history/history-store";
import { colors } from "@/constants/theme";
import { clock } from "@/utils/date";

import { HandRow, handRowLabel, sessionMeta } from "./hands-page";

jest.mock("@/lib/history/history-provider", () => ({ useHistory: () => ({ uploadingSessionId: null }) }));
jest.mock("./ledger/mini-tile", () => ({
  MiniTile: ({ letter }: { letter: string }) => {
    const { Text: MockText } = jest.requireActual<typeof import("react-native")>("react-native");
    return <MockText testID="mini-tile">{letter}</MockText>;
  },
}));

const START = new Date(2026, 9, 17, 21, 40).getTime();

function hand({ word = "MONSTER", score = 37, finalStack = 1330, folded = false }: {
  word?: string | null; score?: number; finalStack?: number; folded?: boolean;
} = {}): HistoryHand {
  return {
    id: "s:12", sessionId: "s", handNo: 12, mode: "offline", ranked: false,
    startedAtMs: START, endedAtMs: START + 60_000, dictionaryId: "en_US-large", heroId: "hero",
    seats: [{ playerId: "hero", name: "You", initialStack: 1000 }],
    actions: folded ? [{ sequence: 0, atMs: START, source: "player", action: { type: "fold", playerId: "hero" } }] : [],
    summary: {
      outcome: "showdown", community: [], pots: [],
      seats: [{ playerId: "hero", privateTiles: [], submission: null, word, score, reason: null, place: 1, finalStack }],
    },
  };
}

const row = (value: HistoryHand): LocalHistoryHand => ({
  hand: value, status: "synced", error: null, record: null, attempts: 0, retryAtMs: 0,
});

test("row labels read the hand as one sentence", () => {
  expect(handRowLabel(hand())).toBe(`Hand 12, ${clock(START)}, word MONSTER, 37 points, won 330 chips`);
  expect(handRowLabel(hand({ word: null, score: 0, finalStack: 960, folded: true }))).toBe("Hand 12, folded, lost 40 chips");
});

test("a won hand shows its tiles, points and plus chips", async () => {
  const open = jest.fn();
  const view = await render(<HandRow row={row(hand({ word: "AARDVARKS" }))} open={open} />);
  expect(view.getAllByTestId("mini-tile")).toHaveLength(9);
  expect(view.getByText("37 pts")).toBeOnTheScreen();
  expect(view.getByText("+330")).toHaveStyle({ color: colors.chipUpOnTile });
  await fireEvent.press(view.getByRole("button"));
  expect(open).toHaveBeenCalledTimes(1);
});

test("a folded hand shows FOLDED, no word and minus-sign chips", async () => {
  const view = await render(<HandRow row={row(hand({ word: null, score: 0, finalStack: 960, folded: true }))} open={jest.fn()} />);
  expect(view.getByText("FOLDED")).toBeOnTheScreen();
  expect(view.getByText("no word")).toBeOnTheScreen();
  expect(view.getByText("−40")).toHaveStyle({ color: colors.chipDownOnTile });
  expect(view.queryByTestId("mini-tile")).toBeNull();
});

test("session meta names the status and marks offline sessions unranked", () => {
  const session: HistorySession = {
    sessionId: "s", startedAtMs: START, endedAtMs: START, hands: 12, pending: false, rejected: [], latest: row(hand()),
  };
  expect(sessionMeta(session, null)).toMatch(/· 12 hands · VERIFIED · UNRANKED$/);
});
