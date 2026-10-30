import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

import { SignInScreen, SignUpScreen } from "./auth-screen";
import { ForgotPasswordScreen } from "./password-reset-screen";

const mockSignInEmail = jest.fn();
const mockSignInUsername = jest.fn();
const mockSignUpEmail = jest.fn();
const mockIsUsernameAvailable = jest.fn();
const mockRequestPasswordReset = jest.fn();
const mockLastLogin = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/auth/client/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null }),
    getLastUsedLoginMethod: () => mockLastLogin(),
    signIn: {
      email: (...args: unknown[]) => mockSignInEmail(...args),
      username: (...args: unknown[]) => mockSignInUsername(...args),
    },
    signUp: { email: (...args: unknown[]) => mockSignUpEmail(...args) },
    isUsernameAvailable: (...args: unknown[]) => mockIsUsernameAvailable(...args),
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
  },
}));

jest.mock("@/auth/client/game-center", () => ({
  GAME_CENTER_AVAILABLE: true,
  signInWithGameCenter: jest.fn(),
}));

jest.mock("@/auth/client/session-coordinator", () => ({
  changeSession: (run: () => unknown) => run(),
  setAutoRestore: jest.fn(),
}));

jest.mock("@/lib/history/history-store", () => ({ pendingHistory: jest.fn() }));
jest.mock("@/lib/history/history-sync", () => ({ syncHistory: jest.fn() }));
jest.mock("@/lib/navigation/pending-destination", () => ({ pendingReferral: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  mockLastLogin.mockReturnValue(null);
});

async function typeInto(label: string, value: string) {
  await fireEvent.changeText(screen.getByLabelText(label), value);
}

describe("sign in", () => {
  it("shows the empty-field errors on submit and clears one when its field is edited", async () => {
    await render(<SignInScreen />);
    expect(screen.queryByText("Enter your password.")).toBeNull();

    await fireEvent.press(screen.getByText("TAKE YOUR SEAT"));

    expect(screen.getByText("Enter your email or handle.")).toBeTruthy();
    expect(screen.getByText("Enter your password.")).toBeTruthy();
    expect(mockSignInEmail).not.toHaveBeenCalled();

    await typeInto("Password", "x");

    expect(screen.queryByText("Enter your password.")).toBeNull();
    expect(screen.getByText("Enter your email or handle.")).toBeTruthy();
  });

  it("signs in by handle when the value has no @", async () => {
    mockSignInUsername.mockResolvedValue({ error: null });
    await render(<SignInScreen />);

    await typeInto("Email or handle", "ACE");
    await typeInto("Password", "wordpoker");
    await fireEvent.press(screen.getByText("TAKE YOUR SEAT"));

    await waitFor(() => expect(mockSignInUsername).toHaveBeenCalledWith({ username: "ACE", password: "wordpoker" }));
    expect(mockSignInEmail).not.toHaveBeenCalled();
  });

  it("puts a wrong password on the password field", async () => {
    mockSignInEmail.mockResolvedValue({ error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } });
    await render(<SignInScreen />);

    await typeInto("Email or handle", "a@b.co");
    await typeInto("Password", "wordpoker");
    await fireEvent.press(screen.getByText("TAKE YOUR SEAT"));

    expect(await screen.findByText("That password doesn't match. Try again or reset it.")).toBeTruthy();
  });

  it("toggles the password between masked and shown", async () => {
    await render(<SignInScreen />);
    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByText("SHOW"));

    expect(screen.getByLabelText("Password").props.secureTextEntry).toBe(false);
    expect(screen.getByText("HIDE")).toBeTruthy();
  });

  it("offers the street pills only on sign in", async () => {
    const { unmount } = await render(<SignInScreen />);
    expect(screen.getByText("GAME CENTER")).toBeTruthy();
    expect(screen.getByText("PLAY AS GUEST")).toBeTruthy();
    await unmount();

    await render(<SignUpScreen />);
    expect(screen.queryByText("GAME CENTER")).toBeNull();
    expect(screen.queryByText("PLAY AS GUEST")).toBeNull();
  });
});

describe("last login tag", () => {
  function tagInside(label: string) {
    return within(screen.getByText(label).parent!.parent!.parent!.parent!).queryByText("LAST LOGIN");
  }

  it("shows nothing on a device with no recorded login", async () => {
    await render(<SignInScreen />);
    expect(screen.queryByText("LAST LOGIN")).toBeNull();
  });

  it.each(["email", "username"])("marks the primary button after a %s login", async (method) => {
    mockLastLogin.mockReturnValue(method);
    await render(<SignInScreen />);

    expect(screen.getAllByText("LAST LOGIN")).toHaveLength(1);
    expect(tagInside("TAKE YOUR SEAT")).toBeTruthy();
  });

  it("marks the Game Center pill after a Game Center login", async () => {
    mockLastLogin.mockReturnValue("game-center");
    await render(<SignInScreen />);

    expect(screen.getAllByText("LAST LOGIN")).toHaveLength(1);
    expect(tagInside("TAKE YOUR SEAT")).toBeNull();
  });

  it("stays off the create-account button", async () => {
    mockLastLogin.mockReturnValue("email");
    await render(<SignUpScreen />);
    expect(screen.queryByText("LAST LOGIN")).toBeNull();
  });
});

describe("create account", () => {
  async function submitTakenHandle() {
    mockSignUpEmail.mockResolvedValue({ error: { code: "USERNAME_IS_ALREADY_TAKEN", message: "taken" } });
    await render(<SignUpScreen />);
    await typeInto("Handle", "ace");
    await typeInto("Email", "a@b.co");
    await typeInto("Password", "wordpoker");
    await fireEvent.press(screen.getByText("CREATE ACCOUNT"));
  }

  it("sends the handle uppercase as the player's name", async () => {
    mockSignUpEmail.mockResolvedValue({ error: null });
    await render(<SignUpScreen />);
    await typeInto("Handle", "ace");
    await typeInto("Email", "a@b.co");
    await typeInto("Password", "wordpoker");
    await fireEvent.press(screen.getByText("CREATE ACCOUNT"));

    await waitFor(() => expect(mockSignUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ name: "ACE", username: "ACE", displayUsername: "ACE", email: "a@b.co" }),
    ));
  });

  it("suggests three free handles and fills the field from a chip", async () => {
    mockIsUsernameAvailable.mockImplementation(({ username }: { username: string }) =>
      Promise.resolve({ data: { available: username !== "ACE7" } }));
    await submitTakenHandle();

    expect(await screen.findByText("ACE is taken. Try one of these:")).toBeTruthy();
    expect(screen.queryByText("ACE7")).toBeNull();

    await fireEvent.press(screen.getByText("ACE21"));

    expect(screen.getByLabelText("Handle").props.value).toBe("ACE21");
    expect(screen.queryByText("ACE is taken. Try one of these:")).toBeNull();
    expect(screen.queryByText("ACE99")).toBeNull();
  });

  it("still names the taken handle when no suggestion can be checked", async () => {
    mockIsUsernameAvailable.mockRejectedValue(new Error("offline"));
    await submitTakenHandle();

    expect(await screen.findByText("ACE is taken.")).toBeTruthy();
  });
});

describe("forgot password", () => {
  it("asks for an email before sending", async () => {
    await render(<ForgotPasswordScreen />);
    await fireEvent.press(screen.getByText("SEND RESET LINK"));

    expect(screen.getByText("Enter your email.")).toBeTruthy();
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it("reads the same for any address, and TRY AGAIN starts over", async () => {
    mockRequestPasswordReset.mockResolvedValue({ error: null });
    await render(<ForgotPasswordScreen />);
    await typeInto("Email", "a@b.co");
    await fireEvent.press(screen.getByText("SEND RESET LINK"));

    expect(await screen.findByText("If a@b.co has an account, we sent it a reset link. It expires in 30 minutes.")).toBeTruthy();

    await fireEvent.press(screen.getByText("TRY AGAIN"));

    expect(screen.getByLabelText("Email").props.value).toBe("");
  });
});
