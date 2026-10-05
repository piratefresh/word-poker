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

  it("hands the raise from the slider to its button once the amount is set, and back if it is not", () => {
    const flop = LESSON_TOUR.findIndex((step) => step.id === "lesson-flop");
    const runStep = at("flop-hero-raise");
    const slider = lessonCoach(LESSON_TOUR, flop + 1, runStep);
    expect(slider.step?.id).toBe("lesson-raise-amount");
    expect(slider.step?.target).toBe("raise");

    const press = lessonCoach(LESSON_TOUR, flop + 1, runStep, { raise: true, word: false });
    expect(press.step?.id).toBe("lesson-raise");
    expect(press.step?.target).toBe("wager");

    // Sliding off the amount puts the coach back on the slider: nothing was requested past it.
    expect(lessonCoach(LESSON_TOUR, flop + 1, runStep, { raise: false, word: false }).step?.id).toBe(
      "lesson-raise-amount",
    );
  });

  it("hands the word from the rack to CHECK once the rack spells it", () => {
    const build = LESSON_TOUR.findIndex((step) => step.id === "lesson-word-build");
    const runStep = at("window-hero-word");
    expect(lessonCoach(LESSON_TOUR, build, runStep).step?.target).toBe("rack");
    const lock = lessonCoach(LESSON_TOUR, build, runStep, { raise: false, word: true });
    expect(lock.step?.id).toBe("lesson-word");
    expect(lock.step?.target).toBe("check");
  });

  it("holds the player on the spelling step, and on no step before it", () => {
    const holding = LESSON_TOUR.filter((step) => step.holds === true).map((step) => step.id);
    expect(holding).toEqual(["lesson-word-build"]);
  });

  it("is over once every step is behind it", () => {
    expect(lessonCoach(LESSON_TOUR, LESSON_TOUR.length, TUTORIAL_SCRIPT.length)).toEqual({
      index: LESSON_TOUR.length,
      step: null,
    });
  });
});
