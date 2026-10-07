import { render, type RenderResult } from "@testing-library/react-native";

import { LevelStrip } from "./level-strip";

/** The inline width of the fill — the last entry of its `[base, inline]` style pair. */
function fillWidth(view: RenderResult): unknown {
  const style = view.getByTestId("level-strip-fill").props.style;
  const last = Array.isArray(style) ? style[style.length - 1] : style;

  if (last !== null && typeof last === "object" && "width" in last) return last.width;

  return undefined;
}

test("announces the standing, the bar, and the count", async () => {
  const view = await render(<LevelStrip intoLevel={17} level={3} toNext={220} width={320} />);

  expect(view.getByText("LVL 3")).toBeTruthy();
  expect(view.getByText("17/237 XP")).toBeTruthy();
  expect(view.getByLabelText("Level 3, 17 of 237 XP toward level 4")).toBeTruthy();
});

test("fills the bar from intoLevel over the level's whole span", async () => {
  const empty = await render(<LevelStrip intoLevel={0} level={1} toNext={100} width={320} />);

  expect(fillWidth(empty)).toBe("0%");

  const full = await render(<LevelStrip intoLevel={183} level={2} toNext={0} width={320} />);

  expect(fillWidth(full)).toBe("100%");
});
