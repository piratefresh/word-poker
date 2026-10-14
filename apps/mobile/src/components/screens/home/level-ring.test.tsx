import { render } from "@testing-library/react-native";

import { LevelRing } from "./level-ring";

test("announces XP and fills the circle from progress within the level", async () => {
  const half = await render(<LevelRing intoLevel={50} level={3} toNext={50} />);
  expect(half.getByLabelText("Level 3, 50 of 100 XP toward level 4")).toBeTruthy();
  expect(half.getByTestId("level-ring-fill").props.strokeDashoffset).toBeCloseTo(22 * Math.PI);

  const empty = await render(<LevelRing intoLevel={0} level={1} toNext={100} />);
  expect(empty.getByTestId("level-ring-fill").props.opacity).toBe(0);

  const full = await render(<LevelRing intoLevel={100} level={1} toNext={0} />);
  // react-native-svg normalizes a zero dash offset to null at its native boundary.
  expect(full.getByTestId("level-ring-fill").props.strokeDashoffset ?? 0).toBe(0);
});
