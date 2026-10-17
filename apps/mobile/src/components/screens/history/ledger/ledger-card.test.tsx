import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { LedgerCard } from "./ledger-card";

test("uses a pressable for cards with only a long-press handler", async () => {
  const onLongPress = jest.fn();
  const view = await render(
    <LedgerCard accessibilityLabel="Open hand" onLongPress={onLongPress}>
      <Text>Hand 12</Text>
    </LedgerCard>,
  );

  await fireEvent(view.getByRole("button", { name: "Open hand" }), "longPress");
  expect(onLongPress).toHaveBeenCalledTimes(1);
});
