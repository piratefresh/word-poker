import { fireEvent, render } from "@testing-library/react-native";

import { EMPTY_STORY_PROGRESS, type StoryProgress } from "@wordpoker/game-rules";

import { CHAPTER_MAPS } from "@/features/story/chapter-maps";

import { BriefSheet } from "./brief-sheet";
import { togglePick } from "./loadout-picker";

let mockSaved: StoryProgress = EMPTY_STORY_PROGRESS;
jest.mock("@/features/story/story-progress", () => ({
  storyProgress: () => mockSaved,
  saveStoryProgress: (next: StoryProgress) => {
    mockSaved = next;
  },
}));

const [kitchen, local, , , dealers] = CHAPTER_MAPS;

test("The Dealer's brief asks for two powers, and DEAL saves them as the loadout", async () => {
  mockSaved = EMPTY_STORY_PROGRESS;
  const onDeal = jest.fn();
  const screen = await render(<BriefSheet map={dealers!} node={dealers!.nodes[0]!} onDeal={onDeal} onDismiss={jest.fn()} />);

  expect(screen.getByTestId("story-loadout")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("story-loadout-multiplier"));
  await fireEvent.press(screen.getByTestId("story-loadout-tile_lock"));
  await fireEvent.press(screen.getByTestId("story-deal"));

  expect(onDeal).toHaveBeenCalled();
  expect(mockSaved.chapters["dealers-table"]?.powers).toEqual(["multiplier", "tile_lock"]);
  expect(mockSaved.powersSeen).toEqual(expect.arrayContaining(dealers!.chapter.powerPool));
});

test("a chapter that drafts its powers asks for no loadout, and names its own threshold", async () => {
  const boss = local!.nodes.find((node) => node.kind === "boss")!;
  const screen = await render(<BriefSheet map={local!} node={boss} onDeal={jest.fn()} onDismiss={jest.fn()} />);
  expect(screen.queryByTestId("story-loadout")).toBeNull();
  expect(screen.getByTestId("story-goal-2")).toHaveTextContent(/Score 24\+/);
  await screen.unmount();

  const first = await render(<BriefSheet map={kitchen!} node={kitchen!.nodes[0]!} onDeal={jest.fn()} onDismiss={jest.fn()} />);
  expect(first.getByText("HAND 1 · VS ELLIS")).toBeTruthy();
});

test("a full loadout gives up its oldest pick for a new one", () => {
  expect(togglePick([], "multiplier", 2)).toEqual(["multiplier"]);
  expect(togglePick(["multiplier", "tile_lock"], "pickpocket", 2)).toEqual(["tile_lock", "pickpocket"]);
  expect(togglePick(["multiplier", "tile_lock"], "multiplier", 2)).toEqual(["tile_lock"]);
});
