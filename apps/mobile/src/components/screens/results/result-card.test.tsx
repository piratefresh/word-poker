/**
 * result-card.test.tsx — what one seat's card says, and to whom.
 *
 * The card is drawn from the frozen payload and nothing else, so these render one `ResultsSeat`
 * from `results-fixtures.ts` and read the screen: the badge lands on the pot's seats only, `(you)`
 * lands on the local player's seat wherever it placed, §7's three numbers print even at zero, a
 * seat with no word prints §11's reason instead of one, and the whole card is one accessibility
 * node whose tiles are not separately reachable (STO-381, STO-387).
 *
 * The badge and the tile row are deliberately outside the accessibility tree, so the two tests that
 * read them pass `includeHiddenElements` — that is the point of the hiding, and `queryByLabelText`
 * finding nothing is the other half of it.
 */

import { render, within } from "@testing-library/react-native";
import { useSharedValue } from "react-native-reanimated";

import { getTileAccessibilityLabel } from "@/components/game/word-tile";
import { resultsEntrance } from "@/constants/theme";

import { ResultCard } from "./result-card";
import {
  foldOutSnapshot,
  longWordSnapshot,
  snapshotFixture,
  splitSnapshot,
  youWonSnapshot,
} from "./results-fixtures";
import type { ResultsSeat } from "./results-types";

// The suite's reanimated mock has no `useReducedMotion` — the library ships it as a TODO — and the
// tile reads it, so the one hook is layered on for this file, as the offline screen's test does.
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<Record<string, unknown>>("react-native-reanimated/mock"),
  useReducedMotion: () => false,
}));

describe("<ResultCard />", () => {
  test("prints the badge on the seats the pot paid, and on no others", async () => {
    const view = await render(
      <>
        {splitSnapshot.seats.map((seat) => (
          <ResultCard key={seat.playerId} seat={seat} />
        ))}
      </>,
    );

    // §21.3's draw: both halves of the pot wear the gold and say so.
    for (const seat of splitSnapshot.seats.filter((candidate) => candidate.takesPot)) {
      expect(
        within(view.getByTestId(`result-card-${seat.playerId}`)).getByText("★ TAKES THE POT", {
          includeHiddenElements: true,
        }),
      ).toBeOnTheScreen();
    }

    // The seat the draw did not pay keeps the field's dark card, and no badge with it.
    const field = splitSnapshot.seats.find((seat) => !seat.takesPot);
    expect(field).toBeDefined();
    expect(
      within(view.getByTestId(`result-card-${field?.playerId}`)).queryByText("★ TAKES THE POT", {
        includeHiddenElements: true,
      }),
    ).toBeNull();
  });

  test("marks the local player's seat with `(you)`, wherever it placed", async () => {
    // Third of four, and not the pot's: the mark belongs to the seat, not to the win.
    const placed = await render(<ResultCard seat={snapshotFixture().seats[2]} />);

    expect(placed.getByText("Guest (you)")).toBeOnTheScreen();
    expect(placed.queryByText("★ TAKES THE POT", { includeHiddenElements: true })).toBeNull();

    // And on the winner's card, beside the badge and the gold.
    const won = await render(<ResultCard seat={youWonSnapshot.seats[0]} />);

    expect(won.getByText("Guest (you)")).toBeOnTheScreen();
    expect(won.getByText("★ TAKES THE POT", { includeHiddenElements: true })).toBeOnTheScreen();
  });

  test("prints the word, the score, and §7's three numbers behind them", async () => {
    const view = await render(<ResultCard seat={snapshotFixture().seats[0]} />);

    expect(view.getByText("ENVIRO")).toBeOnTheScreen();
    expect(view.getByText("17")).toBeOnTheScreen();
    expect(view.getByText("PTS")).toBeOnTheScreen();
    expect(view.getByText("Base 12 · Mult +5 · Rack +0")).toBeOnTheScreen();
  });

  test("prints the zeroes §7 did not apply", async () => {
    const view = await render(<ResultCard seat={snapshotFixture().seats[1]} />);

    // `Mult +0` and `Rack +0` are facts about the word, not things to hide from the seat.
    expect(view.getByText("Base 10 · Mult +0 · Rack +0")).toBeOnTheScreen();
  });

  test("prints §11's reason for a seat with no word, and draws no tiles", async () => {
    const seat = snapshotFixture().seats[3];
    const view = await render(<ResultCard seat={seat} />);

    expect(view.getByText("The window closed")).toBeOnTheScreen();
    // The reason is the slot's content, so a reader hears it where the word would have been.
    expect(view.getByLabelText(/no word/)).toBeOnTheScreen();
    expect(
      view.queryByTestId(`result-card-${seat.playerId}-tiles`, { includeHiddenElements: true }),
    ).toBeNull();
  });

  test("draws §26's fold-out as one card with a word slot and nothing to put in it", async () => {
    const seat = foldOutSnapshot.seats[0];
    const view = await render(<ResultCard seat={seat} />);

    // No window ever opened for this seat, so there is no §11 reason behind the empty slot.
    expect(view.getByText("NO WORD")).toBeOnTheScreen();
    expect(view.getByText("Base 0 · Mult +0 · Rack +0")).toBeOnTheScreen();
    expect(
      view.queryByTestId(`result-card-${seat.playerId}-tiles`, { includeHiddenElements: true }),
    ).toBeNull();
  });

  test("is one accessible node for the whole seat, with the tiles out of the tree", async () => {
    const seat = snapshotFixture().seats[0];
    const view = await render(<ResultCard seat={seat} />);

    const card = view.getByLabelText(
      "Ellis, ENVIRO, 17 points, base 12, mult +5, rack +0, takes the pot",
    );

    expect(card).toBeOnTheScreen();
    // The tile's own label — `V, 10 points, double letter` — is inside the hidden row: the card's
    // sentence is what a reader gets, not six tiles read out beside it.
    expect(view.queryByLabelText(getTileAccessibilityLabel(seat.tiles[2]))).toBeNull();
  });

  test("marks a tile a power handed the seat with its ⚡, and no other tile (§44)", async () => {
    const played = snapshotFixture().seats[0];
    const seat: ResultsSeat = {
      ...played,
      tiles: played.tiles.map((tile, index) =>
        index === 1 ? { id: "power-0", letter: tile.letter, points: tile.points } : tile,
      ),
    };
    const view = await render(<ResultCard seat={seat} />);

    const marks = view.getAllByTestId(/-powered$/, { includeHiddenElements: true });
    expect(marks.map((mark) => mark.props.testID)).toEqual([
      `result-card-${seat.playerId}-tile-1-powered`,
    ]);
  });

  test("draws a choice tile as the face it played, its two faces settled under it (§10)", async () => {
    const played = snapshotFixture().seats[0];
    const seat: ResultsSeat = {
      ...played,
      word: "E" + (played.word ?? "").slice(1),
      tiles: [
        { id: "AE-9", letter: "A", points: 1, alternativeLetter: "E", alternativePoints: 1 },
        ...played.tiles.slice(1),
      ],
    };
    const view = await render(<ResultCard seat={seat} />);
    const hidden = { includeHiddenElements: true };
    const prefix = `result-card-${seat.playerId}-tile-0`;

    expect(view.getByTestId(`${prefix}-face-A`, hidden)).toBeOnTheScreen();
    expect(view.getByTestId(`${prefix}-face-E`, hidden)).toBeOnTheScreen();
    expect(within(view.getByTestId(prefix, hidden)).queryByText("A", hidden)).toBeNull();
  });

  test("draws §12's longest word, seven letters out of seven tiles", async () => {
    const seat = longWordSnapshot.seats[0];
    const view = await render(<ResultCard seat={seat} />);

    expect(view.getByText("MARKETS")).toBeOnTheScreen();
    expect(
      view.getAllByTestId(new RegExp(`^result-card-${seat.playerId}-tile-\\d+$`), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(7);
  });

  test("prints the same card on a motion beat as it does settled", async () => {
    const seat = snapshotFixture().seats[0];
    const view = await render(<WinnerOnTheClock seat={seat} />);

    // The beat moves styles and never content: with the screen's clock handed in, everything the
    // settled card says is still on the card — the word, the score, §7's numbers, every tile.
    expect(view.getByText("ENVIRO")).toBeOnTheScreen();
    expect(view.getByText("17")).toBeOnTheScreen();
    expect(view.getByText("Base 12 · Mult +5 · Rack +0")).toBeOnTheScreen();
    expect(
      view.getAllByTestId(new RegExp(`^result-card-${seat.playerId}-tile-\\d+$`), {
        includeHiddenElements: true,
      }),
    ).toHaveLength(6);
  });
});

/** The winner's card as the screen hands it over: on the sequence's clock, at its own beat. */
function WinnerOnTheClock({ seat }: { seat: ResultsSeat }) {
  const clock = useSharedValue(1);

  return <ResultCard motion={{ at: resultsEntrance.winner, clock, winner: true }} seat={seat} />;
}
