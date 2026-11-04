import { fireEvent, render } from "@testing-library/react-native";
import { createRef } from "react";
import { Text, type TextInput } from "react-native";

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText } from "./input-group";

test("lays out start addons, the control, then end addons, whatever the JSX order", async () => {
  const view = await render(
    <InputGroup>
      <InputGroupAddon align="inline-end">
        <InputGroupText>END</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput accessibilityLabel="Amount" />
      <InputGroupAddon>
        <InputGroupText>START</InputGroupText>
      </InputGroupAddon>
    </InputGroup>,
  );

  const tree = JSON.stringify(view.toJSON());
  const start = tree.indexOf('"START"');
  const control = tree.indexOf('"accessibilityLabel":"Amount"');
  const end = tree.indexOf('"END"');
  expect(start).toBeGreaterThan(-1);
  expect(start).toBeLessThan(control);
  expect(control).toBeLessThan(end);
});

test("tapping an addon focuses the control", async () => {
  const input = createRef<TextInput>();
  const view = await render(
    <InputGroup>
      <InputGroupInput ref={input} />
      <InputGroupAddon align="inline-end">
        <InputGroupText>USD</InputGroupText>
      </InputGroupAddon>
    </InputGroup>,
  );
  // RN's jest mock shares one `focus` mock across TextInputs, so start each test from zero.
  const focus = jest.spyOn(input.current!, "focus");
  focus.mockClear();

  await fireEvent.press(view.getByText("USD"));

  expect(focus).toHaveBeenCalled();
});

test("a button in an addon handles its own press and leaves focus alone", async () => {
  const input = createRef<TextInput>();
  const onPress = jest.fn();
  const view = await render(
    <InputGroup>
      <InputGroupInput ref={input} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton label="Clear" onPress={onPress} size="icon-xs">
          <Text>x</Text>
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>,
  );
  // RN's jest mock shares one `focus` mock across TextInputs, so start each test from zero.
  const focus = jest.spyOn(input.current!, "focus");
  focus.mockClear();

  await fireEvent.press(view.getByLabelText("Clear"));

  expect(onPress).toHaveBeenCalled();
  expect(focus).not.toHaveBeenCalled();
});

test("a disabled group makes its control read-only", async () => {
  const view = await render(
    <InputGroup disabled>
      <InputGroupInput accessibilityLabel="Name" />
    </InputGroup>,
  );

  expect(view.getByLabelText("Name").props.editable).toBe(false);
});
