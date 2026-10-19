import { fireEvent, render, waitFor, within } from "@testing-library/react-native";

import { createTable } from "@/features/online/room-session";
import { CreateTableForm } from "./create-table-form";

jest.mock("@expo/ui", () => {
  const { View } = jest.requireActual("react-native");
  return { BottomSheet: View, RNHostView: View };
});
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("@/features/online/room-session", () => ({ createTable: jest.fn() }));
jest.mock("@/components/word-builder/haptics", () => ({ haptic: jest.fn() }));
jest.mock("react-native-safe-area-context", () =>
  jest.requireActual("react-native-safe-area-context/jest/mock").default,
);

test("offers legal choices, prices the action, and creates the selected table", async () => {
  const create = jest.mocked(createTable).mockResolvedValue("new-table");
  const onClose = jest.fn();
  const onCreated = jest.fn();
  const view = await render(<CreateTableForm visible onClose={onClose} onCreated={onCreated} />);

  expect(view.getByRole("radio", { name: "500 coins buy-in", checked: true })).toBeOnTheScreen();
  expect(view.queryByTestId("create-table-seats-5")).toBeNull();
  expect(within(view.getByTestId("create-table-scroll")).queryByTestId("create-table-submit")).toBeNull();

  await fireEvent.press(view.getByTestId("create-table-submit"));
  expect(create).not.toHaveBeenCalled();
  expect(view.getByTestId("create-table-name-refusal")).toBeOnTheScreen();

  await fireEvent.changeText(view.getByTestId("create-table-name"), " Sunday felt ");
  await fireEvent.press(view.getByTestId("create-table-buy-in-5000"));
  await fireEvent.press(view.getByTestId("create-table-seats-3"));
  await fireEvent.press(view.getByTestId("create-table-power-ups-choose3"));
  expect(view.getByRole("button", { name: "CREATE · 5,000" })).toBeOnTheScreen();
  expect(view.getByRole("radio", { name: "Wild Power", checked: true })).toBeOnTheScreen();
  await fireEvent.press(view.getByTestId("create-table-submit"));

  await waitFor(() => expect(create).toHaveBeenCalledWith({
    name: "Sunday felt", buyIn: 5000, maxSeats: 3, powerUps: { deal: "choose3" },
  }));
  expect(onClose).toHaveBeenCalled();
  expect(onCreated).toHaveBeenCalledWith("new-table");
});
