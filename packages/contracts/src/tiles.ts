/**
 * A tile as it crosses the wire: its identity, the letters it can stand for, and its
 * score. Two-letter tiles carry their second letter in `alternativeLetter`.
 */
export interface Tile {
  id: string;
  letter: string;
  alternativeLetter?: string;
  points: number;
}
