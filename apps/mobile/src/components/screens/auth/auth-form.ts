import { isValidHandle } from "@/auth/handle";

export type AuthMode = "sign-in" | "sign-up";
export type AuthField = "handle" | "email" | "password";
export type AuthValues = Record<AuthField, string>;
export type FieldErrors = Partial<Record<AuthField, string>>;

/** Better Auth's default floor (`password.minPasswordLength`). */
export const MIN_PASSWORD_LENGTH = 8;

export const PASSWORD_TOO_SHORT = `Use ${MIN_PASSWORD_LENGTH} or more characters.`;
const HANDLE_INVALID = "Use 3–12 letters or numbers.";
const WRONG_PASSWORD = "That password doesn't match. Try again or reset it.";

/** The errors a submit can find without asking the server. */
export function validate(mode: AuthMode, { handle, email, password }: AuthValues): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "sign-in") {
    if (!email.trim()) errors.email = "Enter your email or handle.";
    if (!password) errors.password = "Enter your password.";
    return errors;
  }
  if (!handle) errors.handle = "Pick a handle.";
  else if (!isValidHandle(handle)) errors.handle = HANDLE_INVALID;
  if (!email.trim()) errors.email = "Enter your email.";
  if (!password) errors.password = "Create a password.";
  else if (password.length < MIN_PASSWORD_LENGTH) errors.password = PASSWORD_TOO_SHORT;
  return errors;
}

/** The field a server rejection belongs to; anything else shows above the button. */
export function fieldErrorForCode(mode: AuthMode, code: string | undefined, handle: string): FieldErrors | null {
  switch (code) {
    case "USERNAME_IS_ALREADY_TAKEN":
      return { handle: `${handle} is taken.` };
    case "USERNAME_TOO_SHORT":
    case "USERNAME_TOO_LONG":
    case "INVALID_USERNAME":
      // Signing in, a malformed handle is just another pair that doesn't match.
      return mode === "sign-up" ? { handle: HANDLE_INVALID } : { password: WRONG_PASSWORD };
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_USERNAME_OR_PASSWORD":
      return { password: WRONG_PASSWORD };
    case "PASSWORD_TOO_SHORT":
      return { password: PASSWORD_TOO_SHORT };
    case "INVALID_EMAIL":
      return { email: "Check the spelling of that email." };
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return { email: "That email already has an account." };
    default:
      return null;
  }
}
