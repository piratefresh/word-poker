import { act, render } from "@testing-library/react-native";

import { TableImage } from "@/components/table/table-image";

import { setBackdropStyle, type BackdropStyle } from "./backdrop-style";
import { TableBackdrop } from "./table-backdrop.web";

// Keep CanvasKit out of Jest while checking which looks bypass its loader.
jest.mock("@shopify/react-native-skia/lib/module/web", () => ({
  WithSkiaWeb: () => {
    const { View } = jest.requireActual("react-native");
    return <View testID="canvas-backdrop" />;
  },
}));
jest.mock("./tavern-light", () => ({ TavernLight: () => null }));
jest.mock("expo-image", () => ({
  Image: ({ testID = "table-painting" }: { testID?: string }) => {
    const { View } = jest.requireActual("react-native");
    return <View testID={testID} />;
  },
}));

afterEach(() => setBackdropStyle("emerald"));

test.each<BackdropStyle>(["tabletop", "tavern", "planet"])(
  "switching to %s shows room artwork immediately and removes the oval painting",
  async (look) => {
    const view = await render(
      <>
        <TableBackdrop />
        <TableImage width={360} />
      </>,
    );
    expect(view.getByTestId("canvas-backdrop")).toBeOnTheScreen();
    expect(view.getByTestId("table-painting")).toBeOnTheScreen();

    await act(() => setBackdropStyle(look));
    expect(view.getByTestId(`${look}-backdrop`)).toBeOnTheScreen();
    expect(view.queryByTestId("canvas-backdrop")).toBeNull();
    expect(view.queryByTestId("table-painting")).toBeNull();

    await act(() => setBackdropStyle("emerald"));
    expect(view.queryByTestId(`${look}-backdrop`)).toBeNull();
    expect(view.getByTestId("canvas-backdrop")).toBeOnTheScreen();
    expect(view.getByTestId("table-painting")).toBeOnTheScreen();
  },
);

test.each<BackdropStyle>(["emerald", "ember", "wood", "fire", "water"])(
  "%s keeps its canvas backdrop and table painting",
  async (look) => {
    setBackdropStyle(look);
    const view = await render(
      <>
        <TableBackdrop />
        <TableImage width={360} />
      </>,
    );
    expect(view.getByTestId("canvas-backdrop")).toBeOnTheScreen();
    expect(view.getByTestId("table-painting")).toBeOnTheScreen();
  },
);

test("an explicit tabletop look overrides the session's emerald selection", async () => {
  const view = await render(<TableBackdrop look="tabletop" />);
  expect(view.getByTestId("tabletop-backdrop")).toBeOnTheScreen();
  expect(view.queryByTestId("canvas-backdrop")).toBeNull();
});
