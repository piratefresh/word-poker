import { TUTORIAL_SCRIPT } from "@wordpoker/game-rules";

import { LESSON_TOUR } from "@/components/onboarding/tours";

import { lessonCoach } from "./lesson-coach";

const at = (id: string) => TUTORIAL_SCRIPT.findIndex((step) => step.id === id);

describe("lessonCoach", () => {
  it("opens on the first step before anything is played", () => {
    expect(lessonCoach(LESSON_TOUR, 0, 0)).toEqual({ index: 0, step: LESSON_TOUR[0] });
  });

  it("shows nothing while the table plays on toward the next step's checkpoint", () => {
    // After the intro steps the coach waits for the hero's call, which comes after Mira's fold.
    const view = lessonCoach(LESSON_TOUR, 2, at("preflop-mira-fold"));
    expect(view).toEqual({ index: 2, step: null });
    expect(lessonCoach(LESSON_TOUR, 2, at("preflop-hero-call")).step?.id).toBe("lesson-call");
  });

  it("moves past an action step once the player has made the move", () => {
    const view = lessonCoach(LESSON_TOUR, 2, at("preflop-ellis-call"));
    expect(view.index).toBe(3);
    expect(view.step).toBeNull();
    expect(lessonCoach(LESSON_TOUR, 2, at("flop-hero-raise")).step?.id).toBe("lesson-flop");
  });

  it("is over once every step is behind it", () => {
    expect(lessonCoach(LESSON_TOUR, LESSON_TOUR.length, TUTORIAL_SCRIPT.length)).toEqual({
      index: LESSON_TOUR.length,
      step: null,
    });
  });
});
