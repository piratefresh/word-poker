import type { GameScreenState } from "./game-types";

/**
 * The tutorial's reference hand: one deterministic state, so the lesson's felt, seats,
 * and tiles all render the same board instead of drifting apart.
 */
export const FOUR_PLAYER_FLOP_FIXTURE: GameScreenState = {
  id: "demo-hand-flop",
  phase: "flop",
  phaseNumber: 3,
  secondsRemaining: 44,
  seatCount: 4,
  pot: 80,
  players: [
    {
      id: "magnus",
      name: "Magnus",
      initials: "MN",
      stack: 980,
      color: "#b8a6f0",
      status: "your-turn",
      role: "dealer",
      bet: 20,
      isHero: true,
    },
    {
      id: "ellis",
      name: "Ellis",
      initials: "EM",
      stack: 980,
      color: "#e07a5f",
      status: "waiting",
      role: "small-blind",
      bet: 5,
    },
    {
      id: "jay",
      name: "Jay",
      initials: "JR",
      stack: 980,
      color: "#f05b91",
      status: "waiting",
      role: "big-blind",
      bet: 10,
    },
    {
      id: "mira",
      name: "Mira",
      initials: "MQ",
      stack: 980,
      color: "#b8a6f0",
      status: "waiting",
    },
  ],
  community: [
    { id: "community-ae", letter: "A", alternativeLetter: "E", points: 1 },
    { id: "community-n", letter: "N", points: 2 },
    { id: "community-o", letter: "O", points: 1 },
    null,
    null,
  ],
  privateTiles: [
    { id: "private-r", letter: "R", points: 2 },
    { id: "private-w", letter: "W", points: 5 },
  ],
  bestWord: "ROW",
  bestScore: 8,
  betting: {
    minRaise: 20,
    maxRaise: 200,
    raiseStep: 20,
    raiseAmount: 40,
    canFold: true,
    canCheck: true,
    canRaise: true,
  },
};
