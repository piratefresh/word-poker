import { renderToStaticMarkup } from "react-dom/server";

import { LevelRing } from "./level-ring";

jest.mock("react-native", () => {
  const web = jest.requireActual("react-native-web");
  // Preserve Expo's native test setup and lazy exports while rendering this component on web.
  return Object.defineProperties(Object.create(jest.requireActual("react-native")), {
    View: { value: web.View },
    Text: { value: web.Text },
    StyleSheet: { value: web.StyleSheet },
    unstable_createElement: { value: web.unstable_createElement },
  });
});
jest.mock("react-native-svg", () => jest.requireActual("react-native-svg/lib/commonjs/elements.web"));

test("renders the progress ring on web without invalid DOM properties", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    const markup = renderToStaticMarkup(<LevelRing intoLevel={50} level={3} toNext={50} />);
    expect(error.mock.calls.filter(([message]) => String(message).includes("Invalid DOM property"))).toEqual([]);
    expect(markup).toContain('transform="rotate(-90 26 26)"');
  } finally {
    error.mockRestore();
  }
});
