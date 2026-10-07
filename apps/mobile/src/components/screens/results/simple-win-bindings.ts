import type { ResultsSnapshot } from "./results-types";

export interface SimpleWinBindings {
  strings: Record<string, string>;
  numbers: Record<string, number>;
  reduceMotion: boolean;
}

export function getSimpleWinBindings(
  snapshot: ResultsSnapshot,
  reduceMotion: boolean,
): SimpleWinBindings {
  const winners = snapshot.seats.filter((seat) => seat.takesPot);
  const winner = winners[0];
  const letters = Array.from(winner?.word ?? "").slice(0, 7);
  const midpoint = (letters.length - 1) / 2;
  const strings: Record<string, string> = {
    winnerTitle: winners.length > 1 ? "SPLIT POT" : "WINNER",
    scoreLabel: `${winner?.total ?? 0} POINTS${winners.length > 1 ? " EACH" : ""}`,
    potCaption: "POT",
    potLabel: `$${snapshot.pot.toLocaleString()}`,
    winnerName: winner?.isYou ? "YOU" : (winner?.name ?? ""),
    winnerInitials: winner?.initials ?? "",
    winnerStatus: winners.length > 1 ? "TIED" : "WINNER",
  };
  const numbers: Record<string, number> = { showAvatar: winner?.isYou ? 1 : 0 };
  for (let index = 0; index < 7; index += 1) {
    const letter = letters[index];
    const tile = winner?.tiles[index];
    const points = tile === undefined ? 0
      : "alternativeLetter" in tile && tile.alternativeLetter === letter
        ? tile.alternativePoints : tile.points;
    const slot = index + 1;
    const offset = index - midpoint;
    strings[`letter${slot}`] = letter ?? "";
    strings[`points${slot}`] = letter ? String(points) : "";
    numbers[`tile${slot}Opacity`] = letter ? 1 : 0;
    numbers[`tile${slot}X`] = 210 + offset * 56;
    numbers[`tile${slot}Y`] = 122 + offset ** 2 * 5.1;
    numbers[`tile${slot}Rotation`] = offset * 8;
  }
  return { strings, numbers, reduceMotion };
}
