import { LegendList } from "@legendapp/list/react-native";
import { render } from "@testing-library/react-native";

import { LedgerList } from "./ledger-page";

jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    LegendList: jest.fn(({ accessibilityLabel }: { accessibilityLabel?: string }) =>
      React.createElement(View, { accessibilityLabel, testID: "legend-list" }),
    ),
  };
});

test("keeps the native accessible label on the LegendList scroll host", async () => {
  const list = jest.mocked(LegendList);
  list.mockClear();

  const { getByLabelText } = await render(
    <LedgerList
      accessibilityLabel="Hand Ledger hands"
      data={[]}
      estimatedItemSize={110}
      renderItem={() => null}
    />,
  );

  expect(getByLabelText("Hand Ledger hands")).toBeTruthy();
  expect(list.mock.calls[0]?.[0].accessibilityLabel).toBe("Hand Ledger hands");
});
