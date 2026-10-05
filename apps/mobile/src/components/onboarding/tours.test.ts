import { TUTORIAL_SCRIPT, TUTORIAL_TARGET_WORD } from "@wordpoker/game-rules";

import { FELT_TARGETS, HELPER_TOUR, LESSON_TOUR } from "./tours";

describe("coach tours", () => {
  it("point only at targets the felt marks, and name each step once", () => {
    for (const tour of [HELPER_TOUR, LESSON_TOUR]) {
      const ids = tour.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const step of tour) {
        if (step.target !== undefined) expect(FELT_TARGETS).toContain(step.target);
      }
    }
  });

  it("waits only on checkpoints the scripted hand has, and acts only on the hero's", () => {
    const script = new Map(TUTORIAL_SCRIPT.map((step) => [step.id, step]));
    for (const step of LESSON_TOUR) {
      if (step.checkpoint === undefined) {
        expect(step.advance).toBe("next");
        continue;
      }
      expect(script.has(step.checkpoint)).toBe(true);
      if (step.advance === "action") expect(script.get(step.checkpoint)?.actor).toBe("hero");
    }
    // Every move the hero is coached to make has a step that waits for it.
    const heroMoves = TUTORIAL_SCRIPT.filter((step) => step.actor === "hero").map((step) => step.id);
    const waited = LESSON_TOUR.filter((step) => step.advance === "action" && step.prep === undefined).map(
      (step) => step.checkpoint,
    );
    expect(waited).toEqual(heroMoves);
  });

  it("hands every set-up step off to the press that waits on the same move", () => {
    LESSON_TOUR.forEach((step, index) => {
      if (step.prep === undefined) return;
      expect(step.advance).toBe("action");
      const press = LESSON_TOUR[index + 1];
      expect(press?.prep).toBeUndefined();
      expect(press?.advance).toBe("action");
      expect(press?.checkpoint).toBe(step.checkpoint);
    });
  });

  it("coaches the word the scripted hand is built around", () => {
    const word = LESSON_TOUR.find((step) => step.id === "lesson-word");
    expect(String(word?.body)).toContain(TUTORIAL_TARGET_WORD);
  });
});
