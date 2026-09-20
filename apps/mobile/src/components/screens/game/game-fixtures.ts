import type { GameScreenState } from "./game-types";

/**
 * The tutorial's reference hand: one deterministic state, so the lesson's felt, seats,
 * and tiles all render the same board instead of drifting apart.
 *
 * The board is a flop the hero has not answered: three seats are in for the minimum bet and
 * the hero is on the clock owing that call, which is the state that arms every control the
 * felt has (fold, call, raise, all-in) without inventing a side pot.
 */
export const FOUR_PLAYER_FLOP_FIXTURE: GameScreenState = {
  id: "demo-hand-flop",
  phase: "flop",
  phaseNumber: 3,
  secondsRemaining: 44,
  seatCount: 4,
  pot: 60,
  sidePots: [],
  sessionOver: false,
  players: [
    {
      id: "magnus",
      name: "Magnus",
      initials: "MN",
      stack: 980,
      color: "#b8a6f0",
      status: "your-turn",
      role: "dealer",
      isHero: true,
    },
    {
      id: "ellis",
      name: "Ellis",
      initials: "EM",
      stack: 980,
      color: "#e07a5f",
      status: "waiting",
      bet: 20,
    },
    {
      id: "jay",
      name: "Jay",
      initials: "JR",
      stack: 980,
      color: "#f05b91",
      status: "waiting",
      bet: 20,
    },
    {
      id: "mira",
      name: "Mira",
      initials: "MQ",
      stack: 980,
      color: "#b8a6f0",
      status: "waiting",
      bet: 20,
    },
  ],
  community: [
    { id: "community-ae", letter: "A", alternativeLetter: "E", points: 1, alternativePoints: 1 },
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
    minRaise: 40,
    maxRaise: 980,
    raiseStep: 20,
    raiseAmount: 40,
    canFold: true,
    canCheck: false,
    callAmount: 20,
    canRaise: true,
    canBet: false,
    canAllIn: true,
    allInAmount: 980,
    currentBet: 20,
  },
};
