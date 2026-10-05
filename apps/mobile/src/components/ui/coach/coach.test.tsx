import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { CoachCard } from "./coach-card";
import { CoachProvider, CoachTarget, useCoachTour, type CoachStep } from "./coach";

const STEPS: readonly CoachStep[] = [
  { id: "one", icon: "A", title: "Ready", body: "Tap ready.", target: "actions", advance: "action" },
  { id: "two", icon: "B", title: "Actions", body: "Check, call, raise, fold.", target: "actions", advance: "next" },
  { id: "three", title: "Done", body: "That's it.", advance: "next" },
];

describe("CoachCard", () => {
  it("draws the stamp, count, badge and footer of a lesson step", async () => {
    await render(<CoachCard advance="next" body="Copy" icon="A" index={0} kind="coach" title="Ready" total={12} />);

    expect(screen.getByText("COACH")).toBeTruthy();
    expect(screen.getByTestId("coach-count")).toHaveTextContent("1/12");
    expect(screen.getByText("A")).toBeTruthy();
    expect(screen.getByText("1 of 12")).toBeTruthy();
  });

  it("draws a step's clip above its copy, and none for a step without one", async () => {
    const view = await render(
      <CoachCard
        advance="action"
        body="Spell it."
        index={0}
        kind="coach"
        media={{ source: 1, aspectRatio: 2, label: "Spelling a word" }}
        title="Spell"
        total={3}
      />,
    );
    expect(screen.getByLabelText("Spelling a word")).toBeTruthy();

    await view.rerender(<CoachCard advance="action" body="Spell it." index={0} kind="coach" title="Spell" total={3} />);
    expect(screen.queryByTestId("coach-media")).toBeNull();
  });

  it("withholds Next on a step that waits for the player's action", async () => {
    await render(
      <CoachCard advance="action" body="Tap CALL." index={2} kind="coach" onNext={jest.fn()} title="Call" total={9} />,
    );

    expect(screen.queryByTestId("coach-next")).toBeNull();
  });

  it("offers Close on the first step, Previous after it, and Finish on the last", async () => {
    const onClose = jest.fn();
    const onNext = jest.fn();
    const onPrevious = jest.fn();
    const view = await render(
      <CoachCard
        advance="next"
        body="x"
        index={0}
        kind="helper"
        onClose={onClose}
        onNext={onNext}
        onPrevious={onPrevious}
        title="t"
        total={3}
      />,
    );
    expect(screen.getByText("HELPER")).toBeTruthy();
    expect(screen.queryByTestId("coach-count")).toBeNull();
    await fireEvent.press(screen.getByTestId("coach-close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    await view.rerender(
      <CoachCard advance="next" body="x" index={2} kind="helper" onNext={onNext} onPrevious={onPrevious} title="t" total={3} />,
    );
    expect(screen.getByTestId("coach-next")).toHaveTextContent("Finish");
    await fireEvent.press(screen.getByTestId("coach-previous"));
    expect(onPrevious).toHaveBeenCalledTimes(1);
  });
});

describe("CoachProvider", () => {
  it("renders the screen untouched with no tour, and a target outside a provider is a plain view", async () => {
    await render(
      <CoachTarget id="actions">
        <Text>CALL</Text>
      </CoachTarget>,
    );
    expect(screen.getByText("CALL")).toBeTruthy();

    await render(
      <CoachProvider tour={null}>
        <Text>felt</Text>
      </CoachProvider>,
    );
    expect(screen.queryByTestId("coach-card")).toBeNull();
  });

  it("shows the current step over the screen and leaves the target pressable", async () => {
    const press = jest.fn();
    await render(
      <CoachProvider tour={{ kind: "coach", steps: STEPS, index: 0 }}>
        <CoachTarget id="actions">
          <Text onPress={press}>CALL</Text>
        </CoachTarget>
      </CoachProvider>,
    );

    expect(screen.getByText("Ready")).toBeTruthy();
    await fireEvent.press(screen.getByText("CALL"));
    expect(press).toHaveBeenCalledTimes(1);
  });
});

describe("useCoachTour", () => {
  it("opens at the first step, steps forward and back, and closes past the last", async () => {
    const { result } = await renderHook(() => useCoachTour("helper", STEPS));
    expect(result.current.tour).toBeNull();

    await act(async () => result.current.open());
    expect(result.current.tour?.index).toBe(0);
    await act(async () => result.current.tour?.onNext?.());
    await act(async () => result.current.tour?.onNext?.());
    expect(result.current.tour?.index).toBe(2);
    await act(async () => result.current.tour?.onPrevious?.());
    expect(result.current.tour?.index).toBe(1);
    await act(async () => result.current.tour?.onNext?.());
    await act(async () => result.current.tour?.onNext?.());
    expect(result.current.tour).toBeNull();
  });
});
