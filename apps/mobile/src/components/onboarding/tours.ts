/**
 * tours.ts — what the coach says, step by step.
 *
 * Two tours, as the MVP had (four-in-a-row `wordPokerTours`): the **helper** tour the felt's
 * "How to play" opens over any hand, and the **lesson** — the guided first hand (STO-251), whose
 * steps follow the scripted deal in `@wordpoker/game-rules`' tutorial. The MVP's copy taught a
 * different deal (STRONG, a server-held showdown); this is rewritten against seed 34's hand.
 *
 * Targets are the `CoachTarget` ids `GameScreen` marks: `community`, `table`, `rack`, `raise`
 * and `actions`.
 */

import type { CoachStep } from "@/components/ui/coach";

/** The `CoachTarget` ids `GameScreen` provides. */
export const FELT_TARGETS = ["community", "table", "rack", "raise", "actions"] as const;

/** The felt's "How to play": every control, one at a time. */
export const HELPER_TOUR: readonly CoachStep[] = [
  {
    id: "helper-community",
    icon: "1",
    title: "Community letters",
    body:
      "The flop, turn and river reveal shared letters everyone can use. Each reveal can change " +
      "your best word — and your bet.",
    target: "community",
    side: "bottom",
    advance: "next",
  },
  {
    id: "helper-table",
    icon: "2",
    title: "The table",
    body:
      "Every seat shows its stack and what it did this street. The pot in the middle goes to " +
      "the best word at the showdown.",
    target: "table",
    side: "bottom",
    advance: "next",
  },
  {
    id: "helper-rack",
    icon: "3",
    title: "Build your word",
    body:
      "Your two private tiles plus the board. Tap a tile to put it in your word — it stays " +
      "where it is — and drag to reorder: the word reads left to right. Gold-marked tiles " +
      "double or triple their letter.",
    target: "rack",
    side: "top",
    advance: "next",
  },
  {
    id: "helper-raise",
    icon: "4",
    title: "Bet or raise",
    body:
      "Slide to an amount, then tap BET or RAISE. The amount is your total for the round, not " +
      "what you add on top.",
    target: "raise",
    side: "top",
    advance: "next",
  },
  {
    id: "helper-actions",
    icon: "5",
    title: "Your action",
    body:
      "CHECK passes when nothing is owed, CALL matches the bet, FOLD gives up the hand. Once " +
      "the river's betting is done the Word Window opens, and CHECK locks your word in.",
    target: "actions",
    side: "top",
    advance: "next",
  },
];

/**
 * One step of the lesson. `checkpoint` names the scripted move (`TUTORIAL_SCRIPT`'s step id) the
 * step waits for: an `action` step is done when the player has made it, and a `next` step with
 * one is shown when the lesson reaches it.
 */
export interface LessonCoachStep extends CoachStep {
  checkpoint?: string;
}

export const LESSON_TOUR: readonly LessonCoachStep[] = [
  {
    id: "lesson-table",
    icon: "A",
    title: "Your seat",
    body:
      "You're on the dealer button with 1,000 practice chips. Ellis posted the small blind (10) " +
      "and Jay the big blind (20) before anything was dealt.",
    target: "table",
    side: "bottom",
    advance: "next",
  },
  {
    id: "lesson-rack",
    icon: "B",
    title: "Your tiles",
    body:
      "W and B are your private tiles — only you see them. The W is gold-marked: it scores " +
      "double. Shared letters join them as the board opens.",
    target: "rack",
    side: "top",
    advance: "next",
  },
  {
    id: "lesson-call",
    icon: "C",
    title: "Call the blind",
    body:
      "Mira folded. Now it's your turn, and Jay's big blind means you owe 20. Tap CALL to stay " +
      "in the hand.",
    target: "actions",
    side: "top",
    advance: "action",
    checkpoint: "preflop-hero-call",
  },
  {
    id: "lesson-flop",
    icon: "D",
    title: "The flop",
    body:
      "Three shared letters: N, R and O. With your W and B that spells BROWN. Tap tiles to put " +
      "them in your word and drag them into order — you can build all hand long.",
    target: "rack",
    side: "top",
    advance: "next",
    checkpoint: "flop-hero-raise",
  },
  {
    id: "lesson-raise",
    icon: "E",
    title: "Raise",
    body:
      "Jay bet 20. You have a strong word, so raise: slide to 60 and tap RAISE. That's your " +
      "total for the round.",
    target: "raise",
    side: "top",
    advance: "action",
    checkpoint: "flop-hero-raise",
  },
  {
    id: "lesson-turn",
    icon: "F",
    title: "The turn",
    body:
      "Ellis folded and Jay called. Nothing is owed now, so tap CHECK to see the next letter " +
      "for free.",
    target: "actions",
    side: "top",
    advance: "action",
    checkpoint: "turn-hero-check",
  },
  {
    id: "lesson-river",
    icon: "G",
    title: "The river",
    body: "The last shared letter is out. Jay checked again — tap CHECK to close the betting.",
    target: "actions",
    side: "top",
    advance: "action",
    checkpoint: "river-hero-check",
  },
  {
    id: "lesson-word",
    icon: "H",
    title: "Lock in your word",
    body:
      "The Word Window is open. Make sure your rack spells BROWN, then tap CHECK to lock it in. " +
      "A locked word is final — even if it isn't in the dictionary.",
    target: "rack",
    side: "top",
    advance: "action",
    checkpoint: "window-hero-word",
  },
  {
    id: "lesson-showdown",
    icon: "I",
    title: "Showdown",
    body:
      "BROWN scores 22: B 4, R 2×2, O 1×2, W 5×2, N 2. When Jay locks in, the best word takes " +
      "the pot.",
    advance: "next",
    checkpoint: "window-jay-word",
  },
];
