import { render } from "@testing-library/react-native";

import { TableBackdrop } from "./table-backdrop";

// The setup file stubs the backdrop out of every other suite; this one tests it.
jest.unmock("./table-backdrop");
jest.mock("./coin-bowl", () => ({ CoinBowl: () => null }));
jest.mock("./drink", () => ({ Drink: () => null }));
jest.mock("expo-image", () => ({
  Image: ({ testID }: { testID?: string }) => {
    const { View } = jest.requireActual("react-native");
    return <View testID={testID} />;
  },
}));

// The drink dressing is disabled while its Rive runtime is tuned; the room art and the
// coin-bowl shadow are what ship.
test("the backdrop is always the tabletop room", async () => {
  const view = await render(<TableBackdrop />);
  expect(view.getByTestId("tabletop-backdrop")).toBeOnTheScreen();
});
