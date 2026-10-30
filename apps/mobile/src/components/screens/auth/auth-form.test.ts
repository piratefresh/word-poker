import { handleCandidates, isValidHandle, MAX_HANDLE_LENGTH } from "@/auth/handle";

import { fieldErrorForCode, validate } from "./auth-form";

const EMPTY = { handle: "", email: "", password: "" };

describe("validate", () => {
  it("names every empty sign-in field", () => {
    expect(validate("sign-in", EMPTY)).toEqual({
      email: "Enter your email or handle.",
      password: "Enter your password.",
    });
  });

  it("names every empty sign-up field", () => {
    expect(validate("sign-up", EMPTY)).toEqual({
      handle: "Pick a handle.",
      email: "Enter your email.",
      password: "Create a password.",
    });
  });

  it("refuses a short password and a malformed handle on sign-up", () => {
    expect(validate("sign-up", { handle: "A B", email: "a@b.co", password: "short" })).toEqual({
      handle: "Use 3–12 letters or numbers.",
      password: "Use 8 or more characters.",
    });
  });

  it("does not hold a sign-in password to the sign-up floor", () => {
    expect(validate("sign-in", { ...EMPTY, email: "ACE", password: "short" })).toEqual({});
  });
});

describe("fieldErrorForCode", () => {
  it("puts a failed sign-in on the password, however it was addressed", () => {
    const wrong = { password: "That password doesn't match. Try again or reset it." };
    expect(fieldErrorForCode("sign-in", "INVALID_EMAIL_OR_PASSWORD", "")).toEqual(wrong);
    expect(fieldErrorForCode("sign-in", "INVALID_USERNAME_OR_PASSWORD", "")).toEqual(wrong);
    expect(fieldErrorForCode("sign-in", "USERNAME_TOO_SHORT", "")).toEqual(wrong);
  });

  it("names the taken handle", () => {
    expect(fieldErrorForCode("sign-up", "USERNAME_IS_ALREADY_TAKEN", "ACE")).toEqual({ handle: "ACE is taken." });
  });

  it("leaves unknown codes to the form", () => {
    expect(fieldErrorForCode("sign-up", "RATE_LIMITED", "ACE")).toBeNull();
    expect(fieldErrorForCode("sign-in", undefined, "")).toBeNull();
  });
});

describe("handles", () => {
  it("accepts 3–12 letters or numbers only", () => {
    expect(isValidHandle("ACE7")).toBe(true);
    expect(isValidHandle("AC")).toBe(false);
    expect(isValidHandle("ABCDEFGHIJKLM")).toBe(false);
    expect(isValidHandle("ACE_HIGH")).toBe(false);
  });

  it("offers valid, different candidates even for a full-length handle", () => {
    const candidates = handleCandidates("ABCDEFGHIJKL");
    expect(new Set(candidates).size).toBe(candidates.length);
    for (const candidate of candidates) {
      expect(candidate.length).toBeLessThanOrEqual(MAX_HANDLE_LENGTH);
      expect(isValidHandle(candidate)).toBe(true);
    }
  });
});
