/**
 * The rating card, pressed the way a player presses it.
 *
 * `sendResultsRating` is the only thing stubbed: the card may not know what a network is, and
 * every assertion here is about what it hands the module and what it does with the answer.
 */

import { fireEvent, render, waitFor, type RenderResult } from "@testing-library/react-native";

import { RATING_NOTE_MAX, RATING_TAGS, sendResultsRating } from "@/lib/results-rating";

import { RatingCard } from "./rating-card";

jest.mock("@/lib/results-rating", () => ({
  ...jest.requireActual<{ sendResultsRating: typeof sendResultsRating }>(
    "@/lib/results-rating",
  ),
  sendResultsRating: jest.fn(),
}));

const send = jest.mocked(sendResultsRating);

/** A card that reached for the network itself would find this, and the assertions below fail. */
const fetchMock = jest.fn();

/** The hand the screen hands the card: one number, one seed. */
const HAND = { handNo: 18, seed: 20_260_919 };

const NOTE = "The deal animation stuttered on the second hand.";

/** The level the chips are lit to, read off the state each chip exposes. */
function litLevels(view: RenderResult): readonly number[] {
  return [1, 2, 3, 4, 5].filter(
    (level) => view.getByTestId(`rating-chip-${level}`).props.accessibilityState.selected === true,
  );
}

function caption(view: RenderResult): string {
  return view.getByTestId("rating-caption").props.children;
}

function isDisabled(view: RenderResult): boolean {
  return view.getByTestId("rating-send").props.accessibilityState.disabled === true;
}

/** Opens the panel the tags and the note live behind. */
async function openPanel(view: RenderResult): Promise<void> {
  await fireEvent.press(view.getByTestId("rating-more"));
}

beforeEach(() => {
  send.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("<RatingCard />", () => {
  test("sends nothing while there is nothing to say", async () => {
    const view = await render(<RatingCard {...HAND} />);

    expect(isDisabled(view)).toBe(true);
    await fireEvent.press(view.getByTestId("rating-send"));
    expect(send).not.toHaveBeenCalled();

    // A note of nothing but spaces is not a report either: the gate is on what the player
    // said, not on whether the field has been touched.
    await openPanel(view);
    await fireEvent.changeText(view.getByTestId("rating-note"), "   ");
    expect(isDisabled(view)).toBe(true);
    await fireEvent.press(view.getByTestId("rating-send"));
    expect(send).not.toHaveBeenCalled();
  });

  test("sends the hand and the report, and cannot send it twice", async () => {
    let land: (stored: { id: string }) => void = () => {};
    send.mockImplementation(
      () =>
        new Promise<{ id: string }>((resolve) => {
          land = resolve;
        }),
    );

    const view = await render(<RatingCard {...HAND} />);
    await fireEvent.press(view.getByTestId("rating-chip-4"));
    await openPanel(view);
    await fireEvent.press(view.getByTestId("rating-tag-Bug"));
    await fireEvent.changeText(view.getByTestId("rating-note"), NOTE);

    await fireEvent.press(view.getByTestId("rating-send"));
    expect(send).toHaveBeenCalledWith({
      handNo: HAND.handNo,
      seed: HAND.seed,
      rating: 4,
      tags: ["Bug"],
      note: NOTE,
    });
    // The module is the card's only way out: it never reaches for `fetch` itself.
    expect(fetchMock).not.toHaveBeenCalled();

    // A second press while the first is still out is not a second report.
    await fireEvent.press(view.getByTestId("rating-send"));
    expect(send).toHaveBeenCalledTimes(1);

    land({ id: "9f1c4a" });

    await waitFor(() => expect(view.getByTestId("rating-thanks")).toBeOnTheScreen());
    expect(view.getByText("Noted \u2014 thank you")).toBeOnTheScreen();
    // The form is gone with it: there is nothing left to press for the rest of the card's life.
    expect(view.queryByTestId("rating-send")).toBeNull();
    expect(view.queryByTestId("rating-note")).toBeNull();
  });

  test("takes tags alone, in one order, with no level", async () => {
    send.mockResolvedValue({ id: "9f1c4b" });

    const view = await render(<RatingCard {...HAND} />);
    expect(view.queryByTestId("rating-tag-Bug")).toBeNull();

    await openPanel(view);
    for (const tag of RATING_TAGS) {
      expect(view.getByTestId(`rating-tag-${tag}`)).toBeOnTheScreen();
      expect(
        view.getByTestId(`rating-tag-${tag}`).props.accessibilityState.selected,
      ).toBe(false);
    }

    // Tapped Bug first, Pacing second: the report still reads in the row's own order, so the
    // same two tags always describe the same hand the same way.
    await fireEvent.press(view.getByTestId("rating-tag-Bug"));
    await fireEvent.press(view.getByTestId("rating-tag-Pacing"));
    expect(view.getByTestId("rating-tag-Bug").props.accessibilityState.selected).toBe(true);

    await fireEvent.press(view.getByTestId("rating-send"));
    expect(send).toHaveBeenCalledWith({
      handNo: HAND.handNo,
      seed: HAND.seed,
      rating: null,
      tags: ["Pacing", "Bug"],
      note: "",
    });
  });

  test("a tag toggles back off, and the report goes with it", async () => {
    const view = await render(<RatingCard {...HAND} />);
    await openPanel(view);

    // No level, one tag: the tag is the whole report, and the only thing arming Send.
    expect(isDisabled(view)).toBe(true);
    await fireEvent.press(view.getByTestId("rating-tag-Pacing"));
    expect(view.getByTestId("rating-tag-Pacing").props.accessibilityState.selected).toBe(true);
    expect(isDisabled(view)).toBe(false);

    await fireEvent.press(view.getByTestId("rating-tag-Pacing"));
    expect(view.getByTestId("rating-tag-Pacing").props.accessibilityState.selected).toBe(false);
    expect(isDisabled(view)).toBe(true);
  });

  test("lights the chips up to the level chosen, and lets the caption follow the pointer", async () => {
    const view = await render(<RatingCard {...HAND} />);

    expect(litLevels(view)).toEqual([]);
    expect(caption(view)).toBe("");

    await fireEvent.press(view.getByTestId("rating-chip-4"));
    expect(litLevels(view)).toEqual([1, 2, 3, 4]);

    // A lower level is not additive: the row reads the level the player last chose.
    await fireEvent.press(view.getByTestId("rating-chip-2"));
    expect(litLevels(view)).toEqual([1, 2]);
    expect(caption(view)).toBe("Could be smoother");

    // Hovering reads a level out before it is chosen; leaving the row falls back to the choice.
    // The pointer's handlers are the chip's own props: this runner is the ios platform, where
    // Pressability attaches no pointer listeners to a view, so the handler is fired directly.
    await fireEvent(view.getByTestId("rating-chip-5"), "hoverIn");
    expect(caption(view)).toBe("All-in, loved it");
    expect(litLevels(view)).toEqual([1, 2]);
    await fireEvent(view.getByTestId("rating-chip-5"), "hoverOut");
    expect(caption(view)).toBe("Could be smoother");

    // The focus ring reads the same line out, which is the keyboard's way into the row.
    await fireEvent(view.getByTestId("rating-chip-3"), "focus");
    expect(caption(view)).toBe("Solid play");
    await fireEvent(view.getByTestId("rating-chip-3"), "blur");
    expect(caption(view)).toBe("Could be smoother");
  });

  test("keeps the whole report when the send is refused, and sends it again", async () => {
    send.mockRejectedValueOnce(new Error("Service unavailable")).mockResolvedValueOnce({
      id: "9f1c4c",
    });

    const view = await render(<RatingCard {...HAND} />);
    await fireEvent.press(view.getByTestId("rating-chip-5"));
    await openPanel(view);
    await fireEvent.press(view.getByTestId("rating-tag-Visuals"));
    await fireEvent.changeText(view.getByTestId("rating-note"), NOTE);

    await fireEvent.press(view.getByTestId("rating-send"));

    await waitFor(() => expect(view.getByTestId("rating-error")).toBeOnTheScreen());
    expect(view.getByTestId("rating-error")).toHaveTextContent(/Service unavailable/);
    // Every keystroke survived: the note, the level and the tag are all still there to retry.
    expect(view.getByTestId("rating-note").props.value).toBe(NOTE);
    expect(litLevels(view)).toEqual([1, 2, 3, 4, 5]);
    expect(view.getByTestId("rating-tag-Visuals").props.accessibilityState.selected).toBe(true);
    expect(isDisabled(view)).toBe(false);

    await fireEvent.press(view.getByTestId("rating-send"));

    await waitFor(() => expect(view.getByTestId("rating-thanks")).toBeOnTheScreen());
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({
      handNo: HAND.handNo,
      seed: HAND.seed,
      rating: 5,
      tags: ["Visuals"],
      note: NOTE,
    });
  });

  test("never lets the note past its cap, however it arrives", async () => {
    const view = await render(<RatingCard {...HAND} />);
    await openPanel(view);
    const note = () => view.getByTestId("rating-note");

    // A paste is one `changeText` carrying more than the field's limit; `maxLength` alone does
    // not stop it on every platform, which is why the field clamps what it accepts.
    await fireEvent.changeText(note(), "x".repeat(RATING_NOTE_MAX + 120));
    expect(note().props.value).toHaveLength(RATING_NOTE_MAX);

    await fireEvent.changeText(note(), "y".repeat(RATING_NOTE_MAX));
    expect(note().props.value).toHaveLength(RATING_NOTE_MAX);

    send.mockResolvedValue({ id: "9f1c4d" });
    await fireEvent.press(view.getByTestId("rating-send"));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ note: "y".repeat(RATING_NOTE_MAX) }),
    );
  });
});
