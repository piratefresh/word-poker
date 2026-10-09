import { getSimpleWinBindings } from "./simple-win-bindings";
import { foldOutSnapshot, seatFixture, snapshotFixture, splitSnapshot } from "./results-fixtures";

test("centers a short winning word, hides unused tiles, and takes resolved values", () => {
  const snapshot = snapshotFixture({ pot: 640, seats: [seatFixture({
    name: "Sage", initials: "SA", word: "OX", total: 29, takesPot: true,
    tiles: [
      { id: "o", letter: "O", points: 1 },
      { id: "x", letter: "X", points: 8 },
    ],
  })] });
  const data = getSimpleWinBindings(snapshot, true);
  expect(data.strings).toMatchObject({ letter1: "O", letter2: "X", points2: "8",
    scoreLabel: "29 POINTS", potCaption: "POT", potLabel: "$640", winnerName: "Sage", winnerInitials: "SA" });
  expect(data.numbers).toMatchObject({ tile1X: 182, tile2X: 238, tile1Opacity: 1,
    tile2Opacity: 1, tile3Opacity: 0, tile7Opacity: 0, showAvatar: 0 });
  expect(data.reduceMotion).toBe(true);
});

test("uses a choice tile's selected face value", () => {
  const snapshot = snapshotFixture({ seats: [seatFixture({ name: "You", isYou: true,
    word: "OX", takesPot: true, tiles: [
      { id: "choice", letter: "A", points: 2, alternativeLetter: "O", alternativePoints: 7 },
      { id: "x", letter: "X", points: 8 },
    ],
  })] });
  const data = getSimpleWinBindings(snapshot, false);
  expect(data.strings.points1).toBe("7");
  expect(data.strings.winnerName).toBe("YOU");
  expect(data.numbers.showAvatar).toBe(1);
});

test("shows split-pot copy and hides every tile for a fold-out", () => {
  expect(getSimpleWinBindings(splitSnapshot, false).strings).toMatchObject({
    winnerTitle: "SPLIT POT", winnerStatus: "TIED", scoreLabel: "17 POINTS EACH",
  });
  const data = getSimpleWinBindings(foldOutSnapshot, false);
  for (let slot = 1; slot <= 7; slot += 1) expect(data.numbers[`tile${slot}Opacity`]).toBe(0);
});
