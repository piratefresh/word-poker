import { fireEvent, render, screen } from "@testing-library/react-native";

import { authClient } from "@/auth/client/auth-client";
import { reauthenticateWithGameCenter } from "@/auth/client/game-center";
import { setAutoRestore } from "@/auth/client/session-coordinator";

import { DeleteAccount } from "./delete-account";

jest.mock("@/auth/client/auth-client", () => ({ authClient: { deleteUser: jest.fn() } }));
jest.mock("@/auth/client/game-center", () => ({ GAME_CENTER_AVAILABLE: true, reauthenticateWithGameCenter: jest.fn() }));
jest.mock("@/auth/client/session-coordinator", () => ({
  changeSession: (change: () => Promise<unknown>) => change(),
  setAutoRestore: jest.fn(async () => {}),
}));
jest.mock("@expo/ui", () => {
  const React = require("react");
  const { Pressable, Text, TextInput } = require("react-native");
  return {
    Button: ({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) =>
      React.createElement(Pressable, { onPress, testID }, React.createElement(Text, null, label)),
    Text: ({ children }: { children: unknown }) => React.createElement(Text, null, children),
    TextInput: ({ value, testID }: { value: { value: string }; testID: string }) =>
      React.createElement(TextInput, { testID, onChangeText: (text: string) => { value.value = text; } }),
    useNativeState: (initial: string) => React.useRef({ value: initial }).current,
  };
});

const deleteUser = jest.mocked(authClient.deleteUser);
const reauth = jest.mocked(reauthenticateWithGameCenter);
const onDeleted = jest.fn();

const show = (providers: string[]) => render(<DeleteAccount onBack={jest.fn()} onDeleted={onDeleted} providers={providers} />);
const confirm = () => fireEvent.press(screen.getByTestId("delete-account-confirm"));

beforeEach(() => {
  jest.clearAllMocks();
  deleteUser.mockResolvedValue({ data: { success: true }, error: null } as never);
  reauth.mockResolvedValue({ ok: true });
});

it("warns what goes and that coins are not refunded", async () => {
  await show(["credential"]);
  expect(screen.getByText(/account, coin balance, XP and level, match history, and friends/)).toBeTruthy();
  expect(screen.getByText(/Coins aren’t refundable/)).toBeTruthy();
});

it("needs the password of an email account, and reports a wrong one", async () => {
  await show(["credential", "game-center"]);
  await confirm();
  expect(screen.getByText("Enter your password.")).toBeTruthy();
  expect(deleteUser).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByTestId("delete-account-password"), "hunter2");
  deleteUser.mockResolvedValueOnce({ data: null, error: { code: "INVALID_PASSWORD" } } as never);
  await confirm();
  expect(deleteUser).toHaveBeenCalledWith({ password: "hunter2" });
  expect(screen.getByText("That password isn’t right.")).toBeTruthy();
  expect(onDeleted).not.toHaveBeenCalled();
  expect(setAutoRestore).toHaveBeenLastCalledWith(true);

  await confirm();
  expect(onDeleted).toHaveBeenCalledTimes(1);
  expect(setAutoRestore).toHaveBeenLastCalledWith(false);
  expect(reauth).not.toHaveBeenCalled();
});

it("proves a Game Center account first, and stops if that fails", async () => {
  await show(["game-center"]);
  reauth.mockResolvedValueOnce({ ok: false, code: "CANCELLED", message: "Cancelled." });
  await confirm();
  expect(screen.getByText("Cancelled.")).toBeTruthy();
  expect(deleteUser).not.toHaveBeenCalled();

  await confirm();
  expect(deleteUser).toHaveBeenCalledWith({});
  expect(onDeleted).toHaveBeenCalledTimes(1);
});
