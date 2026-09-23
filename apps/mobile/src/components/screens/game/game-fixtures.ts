import type { GameScreenState } from "./game-types";

/**
 * The tutorial's reference hand: one deterministic state, so the lesson's felt, seats,
 * and tiles all render the same board instead of drifting apart.
 *
 * The board is a flop the hero has not answered: the table opened with its blinds — 10 / 20, so
 * every seat is in for the big blind and the hero is on the clock owing a call of it — which is
 * the state that arms every control the felt has (fold, call, raise, all-in) without inventing a
 * side pot. The seats' markers are §5's, derivable from the button the hero holds.
 */
export const FOUR_PLAYER_FLOP_FIXTURE: GameScreenState = {
  id: "demo-hand-flop",
  handId: "demo-hand-flop",
  phase: "flop",
  phaseNumber: 3,
  secondsRemaining: 44,
  seatCount: 4,
  pot: 60,
  sidePots: [],
  // Nothing is in the air on a board that has stopped: the fixture is a still frame, and the
  // flop's bets are already in the pot.
  flights: [],
  sessionOver: false,
  players: [
    {
      id: "magnus",
      name: "Magnus",
      initials: "MN",
      stack: 980,
      color: "#b8a6f0",
      status: "your-turn",
      roles: ["dealer"],
      isHero: true,
    },
    {
      id: "ellis",
      name: "Ellis",
      initials: "EM",
      stack: 980,
      color: "#e07a5f",
      status: "waiting",
      roles: ["small-blind"],
      bet: 20,
    },
    {
      id: "jay",
      name: "Jay",
      initials: "JR",
      stack: 980,
      color: "#f05b91",
      status: "waiting",
      roles: ["big-blind"],
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
  blinds: { smallBlind: 10, bigBlind: 20 },
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
    primary: "call",
    wager: "raise",
  },
};
