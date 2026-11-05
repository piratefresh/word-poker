import { fireEvent, render } from "@testing-library/react-native";

import { EMPTY_STORY_PROGRESS, type StoryProgress } from "@wordpoker/game-rules";

import { StoryDraft } from "./story-draft";

let mockSaved: StoryProgress = EMPTY_STORY_PROGRESS;
jest.mock("@/features/story/story-progress", () => ({
  storyProgress: () => mockSaved,
  saveStoryProgress: (next: StoryProgress) => {
    mockSaved = next;
  },
}));

const withDraft = (draft: StoryProgress["chapters"][string]["draft"], powersSeen?: StoryProgress["powersSeen"]): StoryProgress => ({
  chapters: { "the-local": { stars: {}, best: {}, bossCleared: false, powers: [], draft, bossLosses: 0 } },
  ...(powersSeen === undefined ? {} : { powersSeen }),
});

test("the coach introduces the powers a draft shows for the first time, once", async () => {
  mockSaved = withDraft(["pickpocket", "blank_tile"], ["blank_tile"]);
  const onSettled = jest.fn();
  const screen = await render(<StoryDraft chapterId="the-local" into="Hand 2" offers={["pickpocket", "blank_tile"]} onSettled={onSettled} />);

  expect(screen.getByTestId("story-coach")).toHaveTextContent(/^New power! Pickpocket:/);
  expect(screen.getAllByText("NEW")).toHaveLength(1);

  await fireEvent.press(screen.getByTestId("story-take"));
  expect(onSettled).toHaveBeenCalled();
  expect(mockSaved.powersSeen).toEqual(["blank_tile", "pickpocket"]);
  expect(mockSaved.chapters["the-local"]?.powers).toEqual(["pickpocket"]);
  await screen.unmount();

  mockSaved = withDraft(["pickpocket"], mockSaved.powersSeen);
  const again = await render(<StoryDraft chapterId="the-local" into="Hand 3" offers={["pickpocket"]} onSettled={jest.fn()} />);
  expect(again.queryByTestId("story-coach")).toBeNull();
  expect(again.queryByText("NEW")).toBeNull();
});
