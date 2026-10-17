import { LegendList } from "@legendapp/list/react-native";
import { render } from "@testing-library/react-native";

import { ledgerListAccessibilityProps as nativeProps } from "./ledger-list-accessibility";
import { ledgerListAccessibilityProps as webProps } from "./ledger-list-accessibility.web";
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

test("web maps the label to aria-label so no React Native-only prop reaches the DOM", () => {
  expect(webProps("Hand Ledger hands")).toEqual({ "aria-label": "Hand Ledger hands" });
  expect(webProps()).toEqual({});
  expect(nativeProps("Hand Ledger hands")).toEqual({ accessibilityLabel: "Hand Ledger hands" });
});
