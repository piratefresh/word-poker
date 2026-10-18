import { act, render } from "@testing-library/react-native";
import { View } from "react-native";

import { focusLedgerElement } from "./focus-ledger-element";
import { CurrentLedgerPage, usePageFocus } from "./use-page-focus";

let mockReduced = false;
let mockReadable = true;
jest.mock("@/components/hud/use-reduce-motion", () => ({ useReduceMotion: () => mockReduced }));
jest.mock("./ledger-stage", () => ({ useLedgerReadable: () => mockReadable }));
jest.mock("./focus-ledger-element", () => ({ focusLedgerElement: jest.fn() }));

function Target() {
  const ref = usePageFocus();
  return <View ref={ref} accessible accessibilityLabel="Back to hands" />;
}
const page = (current: boolean) => <CurrentLedgerPage value={current}><Target /></CurrentLedgerPage>;

beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockReadable = true; mockReduced = false; });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

test("focus waits for a completed turn, cancels stale targets, and follows back", async () => {
  const view = await render(page(true));
  await act(() => jest.advanceTimersByTime(749));
  expect(focusLedgerElement).not.toHaveBeenCalled();
  await view.rerender(page(false));
  await act(() => jest.advanceTimersByTime(1));
  expect(focusLedgerElement).not.toHaveBeenCalled();
  await view.rerender(page(true));
  await act(() => jest.advanceTimersByTime(750));
  expect(focusLedgerElement).toHaveBeenCalledTimes(1);
});

test("reduced motion focuses immediately only after the cover is readable", async () => {
  mockReduced = true;
  mockReadable = false;
  const view = await render(page(true));
  await act(() => jest.runOnlyPendingTimers());
  expect(focusLedgerElement).not.toHaveBeenCalled();
  mockReadable = true;
  await view.rerender(page(true));
  await act(() => jest.runOnlyPendingTimers());
  expect(focusLedgerElement).toHaveBeenCalledTimes(1);
});
