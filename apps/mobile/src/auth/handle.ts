/** The handle's rules, shared by the sign-up form and the server's username plugin. */

export const MIN_HANDLE_LENGTH = 3;
export const MAX_HANDLE_LENGTH = 12;

const HANDLE = /^[A-Za-z0-9]+$/;

export function isValidHandle(handle: string): boolean {
  return handle.length >= MIN_HANDLE_LENGTH && handle.length <= MAX_HANDLE_LENGTH && HANDLE.test(handle);
}

const SUFFIXES = ["7", "21", "99", "42", "88", "X"];

/** Alternatives to a taken handle, trimmed to fit; more than the form shows, as some may be taken too. */
export function handleCandidates(handle: string): string[] {
  return SUFFIXES.map((suffix) => handle.slice(0, MAX_HANDLE_LENGTH - suffix.length) + suffix);
}
