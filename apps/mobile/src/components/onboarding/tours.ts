/**
 * tours.ts — what the coach says, step by step.
 *
 * Two tours, as the MVP had (four-in-a-row `wordPokerTours`): the **helper** tour the felt's
 * "How to play" opens over any hand, and the **lesson** — the guided first hand (STO-251), whose
 * steps follow the scripted deal in `@wordpoker/game-rules`' tutorial. The MVP's copy taught a
 * different deal (STRONG, a server-held showdown); this is rewritten against seed 34's hand.
 *
 * Targets are the `CoachTarget` ids `GameScreen` marks: `community`, `table`, `rack`, `raise`
 * (the slider's row), `actions` (the whole action row), and `check` and `wager` (one button each,
 * for a step that asks for that one press).
 */

import type { CoachStep } from "@/components/ui/coach";

/** The `CoachTarget` ids `GameScreen` provides. */
export const FELT_TARGETS = [
  "community",
  "table",
  "rack",
  "raise",
  "actions",
  "check",
  "wager",
] as const;

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
 * What the seat sets up before a move, which the script never sees: the slider standing on an
 * amount the lesson accepts, and the rack spelling the coached word.
 */
export type LessonPrep = "raise" | "word";

/**
 * One step of the lesson. `checkpoint` names the scripted move (`TUTORIAL_SCRIPT`'s step id) the
 * step waits for: an `action` step is done when the player has made it, and a `next` step with
 * one is shown when the lesson reaches it. An `action` step with `prep` is the set-up for that
 * move — it is done as soon as the seat has it ready, so the coach moves on to the press itself.
 */
export interface LessonCoachStep extends CoachStep {
  checkpoint?: string;
  prep?: LessonPrep;
  /**
   * The step holds the player on it until it is done: the felt's actions are disabled and the
   * card offers no way back, so the only thing left to do is what it asks.
   */
  holds?: boolean;
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
    target: "check",
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
    id: "lesson-raise-amount",
    icon: "E",
    title: "Raise",
    body:
      "Jay bet 20. You have a strong word, so raise: slide to 60. That's your total for the " +
      "round, not what you add on top.",
    target: "raise",
    side: "top",
    advance: "action",
    checkpoint: "flop-hero-raise",
    prep: "raise",
  },
  {
    id: "lesson-raise",
    icon: "F",
    title: "Make the raise",
    body: "Now tap RAISE to put your 60 in.",
    target: "wager",
    side: "top",
    advance: "action",
    checkpoint: "flop-hero-raise",
  },
  {
    id: "lesson-turn",
    icon: "G",
    title: "The turn",
    body:
      "Ellis folded and Jay called. Nothing is owed now, so tap CHECK to see the next letter " +
      "for free.",
    target: "check",
    side: "top",
    advance: "action",
    checkpoint: "turn-hero-check",
  },
  {
    id: "lesson-river",
    icon: "H",
    title: "The river",
    body: "The last shared letter is out. Jay checked again — tap CHECK to close the betting.",
    target: "check",
    side: "top",
    advance: "action",
    checkpoint: "river-hero-check",
  },
  {
    id: "lesson-word-build",
    icon: "I",
    title: "Spell your word",
    body:
      "The Word Window is open. Tap B, R, O, W and N to put them in your word, and drag them " +
      "into that order: it reads left to right. CHECK unlocks once your rack spells BROWN.",
    target: "rack",
    side: "top",
    advance: "action",
    checkpoint: "window-hero-word",
    prep: "word",
    holds: true,
    // Recorded off `/dev-word-demo` on the web build: the lesson's own tiles, tapped and dragged
    // into BROWN. Re-record it there when the strip's look or the deal changes.
    media: {
      // Relative, not `@/assets`: Jest maps `@/` to `src/` alone.
      source: require("../../../assets/images/tutorial/spell-word.gif"),
      aspectRatio: 412 / 260,
      label: "Tapping W, B, N, R and O, then dragging W and N into place to spell BROWN",
    },
  },
  {
    id: "lesson-word",
    icon: "J",
    title: "Lock in your word",
    body:
      "Your rack spells BROWN. Tap CHECK to lock it in. A locked word is final — even if it " +
      "isn't in the dictionary.",
    target: "check",
    side: "top",
    advance: "action",
    checkpoint: "window-hero-word",
  },
  {
    id: "lesson-showdown",
    icon: "K",
    title: "Showdown",
    body:
      "BROWN scores 22: B 4, R 2×2, O 1×2, W 5×2, N 2. When Jay locks in, the best word takes " +
      "the pot.",
    advance: "next",
    checkpoint: "window-jay-word",
  },
];
