/**
 * result-card.test.tsx — what one seat's card says, and to whom.
 *
 * The card is drawn from the frozen payload and nothing else, so these render one `ResultsSeat`
 * from `results-fixtures.ts` and read the screen: the local player's seat reads `You` wherever it
 * placed, every seat prints its net, score, stake and read tag, a seat with no word prints §11's
 * reason instead of one, and the whole card is one accessibility node whose tiles are not
 * separately reachable (STO-381, STO-387, STO-960).
 *
 * The tile row is deliberately outside the accessibility tree, so the tests that read it pass
 * `includeHiddenElements` — that is the point of the hiding, and `queryByLabelText` finding nothing
 * is the other half of it.
 */

import { render, within } from "@testing-library/react-native";
import { useSharedValue } from "react-native-reanimated";

import { getTileAccessibilityLabel } from "@/components/game/word-tile";
import { resultsEntrance } from "@/constants/theme";

import { ResultCard } from "./result-card";
import {
  foldOutSnapshot,
  seatFixture,
  longWordSnapshot,
  snapshotFixture,
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
  test("labels a folded player without a word, score or tiles", async () => {
    const view = await render(
      <ResultCard seat={seatFixture({ name: "Guest", isYou: true, folded: true, tag: "folded" })} />,
    );

    expect(view.getByLabelText("Guest (you), folded, net $0, in $0")).toBeOnTheScreen();
    expect(view.getByText("FOLD")).toBeOnTheScreen();
    expect(view.getByText("FOLDED")).toBeOnTheScreen();
    expect(view.queryByText(/PTS/)).toBeNull();
    expect(view.queryByText("NO WORD")).toBeNull();
    expect(view.queryByTestId("result-card-guest-tiles", { includeHiddenElements: true })).toBeNull();
  });

  test("calls the local player `You`, wherever they placed", async () => {
    const placed = await render(<ResultCard seat={snapshotFixture().seats[2]} />);
    expect(placed.getByText("You")).toBeOnTheScreen();

    const won = await render(<ResultCard seat={youWonSnapshot.seats[0]} />);
    expect(won.getByText("You")).toBeOnTheScreen();
  });

  test("prints the seat's net, score, stake and read tag", async () => {
    const winner = await render(<ResultCard seat={snapshotFixture().seats[0]} />);
    expect(winner.getByText("+$60")).toBeOnTheScreen();
    expect(winner.getByText("17 PTS · IN $20")).toBeOnTheScreen();
    expect(winner.getByText("BEST WORD")).toBeOnTheScreen();

    const loser = await render(<ResultCard seat={snapshotFixture().seats[1]} />);
    expect(loser.getByText("−$20")).toBeOnTheScreen();
    expect(loser.getByText("CALLED")).toBeOnTheScreen();
  });

  test("caps an all-in seat, and says how far its chips reached", async () => {
    const seat = seatFixture({
      name: "Alex",
      allIn: true,
      tag: "all-in",
      capped: "Can only win the main pot",
    });
    const view = await render(<ResultCard seat={seat} />);

    // The cap on the avatar keeps the seat's place, and the tag is on the plate.
    expect(view.getByText("1ST · ALL-IN")).toBeOnTheScreen();
    expect(view.getByText("ALL-IN")).toBeOnTheScreen();
    expect(view.getByText("Can only win the main pot")).toBeOnTheScreen();
  });

  test("caps the avatar with the seat's place, except where the seat has none", async () => {
    const second = await render(<ResultCard seat={snapshotFixture().seats[1]} />);
    expect(second.getByText("2ND")).toBeOnTheScreen();

    const folded = seatFixture({ name: "Jay", folded: true, place: 0, tag: "folded" });
    const out = await render(<ResultCard seat={folded} />);
    expect(out.getByText("FOLD")).toBeOnTheScreen();
    expect(out.queryByText("0TH")).toBeNull();

    // §26: nothing was revealed, so a fold-out's winner placed nowhere.
    const walked = await render(<ResultCard seat={foldOutSnapshot.seats[0]} />);
    expect(walked.queryByText("1ST")).toBeNull();
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
    expect(
      view.queryByTestId(`result-card-${seat.playerId}-tiles`, { includeHiddenElements: true }),
    ).toBeNull();
  });

  test("is one accessible node for the whole seat, with the tiles out of the tree", async () => {
    const seat = snapshotFixture().seats[0];
    const view = await render(<ResultCard seat={seat} />);

    const card = view.getByLabelText(
      "Ellis, ENVIRO, 17 points, base 12, mult +5, rack +0, 1st place, net +$60, in $20, best word, takes the pot",
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
    // settled card says is still on the card — the net, the score, the stake, every tile.
    expect(view.getByText("+$60")).toBeOnTheScreen();
    expect(view.getByText("17 PTS · IN $20")).toBeOnTheScreen();
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
