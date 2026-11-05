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

const deleteUser = jest.mocked(authClient.deleteUser);
const reauth = jest.mocked(reauthenticateWithGameCenter);
const onDeleted = jest.fn();

const show = (providers: string[]) => render(<DeleteAccount onBack={jest.fn()} onDeleted={onDeleted} providers={providers} />);
const typeDelete = () => fireEvent.changeText(screen.getByTestId("delete-account-word"), "delete");
const confirm = () => fireEvent.press(screen.getByTestId("delete-account-confirm"));

beforeEach(() => {
  jest.clearAllMocks();
  deleteUser.mockResolvedValue({ data: { success: true }, error: null } as never);
  reauth.mockResolvedValue({ ok: true });
});

it("warns what goes and that coins are not refunded", async () => {
  await show(["credential"]);
  expect(screen.getByText(/lose your level, your coins and your friends list/)).toBeTruthy();
  expect(screen.getByText(/Coins aren’t refundable/)).toBeTruthy();
});

it("stays off until DELETE is typed", async () => {
  await show(["game-center"]);
  expect(screen.getByTestId("delete-account-confirm").props.accessibilityState).toMatchObject({ disabled: true });
  await confirm();
  expect(deleteUser).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByTestId("delete-account-word"), "DELET");
  await confirm();
  expect(deleteUser).not.toHaveBeenCalled();

  await typeDelete();
  expect(screen.getByTestId("delete-account-confirm").props.accessibilityState).toMatchObject({ disabled: false });
});

it("needs the password of an email account, and reports a wrong one", async () => {
  await show(["credential", "game-center"]);
  await typeDelete();
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
  await typeDelete();
  reauth.mockResolvedValueOnce({ ok: false, code: "CANCELLED", message: "Cancelled." });
  await confirm();
  expect(screen.getByText("Cancelled.")).toBeTruthy();
  expect(deleteUser).not.toHaveBeenCalled();

  await confirm();
  expect(deleteUser).toHaveBeenCalledWith({});
  expect(onDeleted).toHaveBeenCalledTimes(1);
});
