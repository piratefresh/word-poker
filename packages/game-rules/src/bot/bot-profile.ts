/** Stable seat styles: tendencies, never knowledge of another player's tiles. */
export interface BotProfile {
  readonly name: "cautious" | "aggressive" | "tricky";
  readonly aggression: number;
  readonly bluff: number;
  readonly slowPlay: number;
  readonly curiosity: number;
  readonly sizing: number;
}

const PROFILES = [
  { name: "cautious", aggression: 0.55, bluff: 0.04, slowPlay: 0.12, curiosity: 0.8, sizing: 0.85 },
  { name: "aggressive", aggression: 0.9, bluff: 0.16, slowPlay: 0.04, curiosity: 1.2, sizing: 1.15 },
  { name: "tricky", aggression: 0.7, bluff: 0.22, slowPlay: 0.32, curiosity: 1, sizing: 1 },
] as const satisfies readonly BotProfile[];

/** Seat one is cautious, two aggressive, three tricky; the dealer and hand never change it. */
export function botProfile(seat: number): BotProfile {
  return PROFILES[((seat + 2) % PROFILES.length + PROFILES.length) % PROFILES.length] ?? PROFILES[0];
}
