import { render } from "@testing-library/react-native";

import { EMPTY_STORY_PROGRESS, storyChapter, type RecordedHand } from "@wordpoker/game-rules";

import { bossNode } from "@/features/story/chapter-map";
import { CHAPTER_MAPS } from "@/features/story/chapter-maps";

import { StoryVerdict, type StoryVerdictProps } from "./story-verdict";

const [kitchen, , , , dealers] = CHAPTER_MAPS;
const beaten = (reward: RecordedHand["reward"]): RecordedHand => ({
  progress: EMPTY_STORY_PROGRESS,
  stars: 2,
  bossBeaten: true,
  reward,
  replayBoss: false,
  coachHint: false,
  draft: null,
});
const hero = { isYou: true, takesPot: true, word: "BANKS", total: 16, tiles: [], net: 40 } as unknown as StoryVerdictProps["hero"];

function verdictOf(map: StoryVerdictProps["map"], props: Partial<StoryVerdictProps>) {
  return render(
    <StoryVerdict built={null} hero={hero} hint={null} into="" map={map} node={bossNode(map)} onLeave={jest.fn()} onReplay={jest.fn()} payout={null} teach={null} verdict={beaten(null)} winner={null} {...props} />,
  );
}

test("a first clear shows the boss's badge and the chapter's coins and XP", async () => {
  const screen = await verdictOf(kitchen!, { verdict: beaten(storyChapter("kitchen-table").reward), payout: "paid" });

  expect(screen.getByText("THE PROFESSOR BEATEN")).toBeTruthy();
  expect(screen.getByLabelText("Professor Badge")).toBeTruthy();
  expect(screen.getByTestId("story-reward")).toHaveTextContent("FIRST CLEAR+100 COINS · +50 XP");
});

test("a replayed boss shows the badge and the stars, and no reward", async () => {
  const screen = await verdictOf(kitchen!, {});

  expect(screen.getByLabelText("Professor Badge")).toBeTruthy();
  expect(screen.queryByTestId("story-reward")).toBeNull();
});

test("a reward that could not be claimed says how it will be paid", async () => {
  const reward = storyChapter("kitchen-table").reward;

  const guest = await verdictOf(kitchen!, { verdict: beaten(reward), payout: "sign-in" });
  expect(guest.getByTestId("story-reward")).toHaveTextContent(/Sign in with a verified email to collect/);
  await guest.unmount();

  const offline = await verdictOf(kitchen!, { verdict: beaten(reward), payout: "later" });
  expect(offline.getByTestId("story-reward")).toHaveTextContent(/paid when you next open the map/);
});

test("beating The Dealer shows his badge and Story Mode Champion", async () => {
  const screen = await verdictOf(dealers!, { verdict: beaten(storyChapter("dealers-table").reward) });

  expect(screen.getByLabelText("Dealer Badge")).toBeTruthy();
  expect(screen.getByLabelText("Story Mode Champion")).toBeTruthy();
  expect(screen.getByTestId("story-reward")).toHaveTextContent(/\+1,500 COINS · \+750 XP/);
});
