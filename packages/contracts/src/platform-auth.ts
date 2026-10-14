/**
 * platform-auth.ts — Game Center / Play Games sign-in and who may earn coins (STO-590, STO-593).
 *
 * The app and the API route agree on these shapes; the native evidence itself is checked only on
 * the server. Every body is parsed strictly: an unexpected field (a `userId`, an eligibility flag)
 * refuses the request rather than being ignored.
 */

/** The account fields eligibility reads; Better Auth's session user satisfies it. */
export interface EligibilityUser {
  readonly isAnonymous?: boolean | null;
  readonly emailVerified?: boolean | null;
  readonly primaryIdentityVerified?: boolean | null;
}

/**
 * May this account earn the welcome grant, quests and referral pay? A permanent account whose
 * email or primary identity (Game Center, Google) the server verified. Product authorization —
 * not a claim that the email works.
 */
export function isAccountEligible(user: EligibilityUser | null | undefined): boolean {
  return !!user && user.isAnonymous !== true && (user.emailVerified === true || user.primaryIdentityVerified === true);
}

/** Internal addresses (`.invalid`, RFC 2606) stand in for accounts without a real email; never mailed or shown. */
export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(".invalid");
}

export const PLATFORM_AUTH_INTENTS = {
  "game-center": ["sign-in", "link"],
  "play-games": ["restore", "associate"],
} as const;

export type PlatformAuthProvider = keyof typeof PLATFORM_AUTH_INTENTS;
export type PlatformAuthIntent = (typeof PLATFORM_AUTH_INTENTS)[PlatformAuthProvider][number];

export const PLATFORM_AUTH_ERRORS = {
  INVALID_INPUT: 400,
  INVALID_PROOF: 401,
  PROOF_EXPIRED: 401,
  SESSION_REQUIRED: 401,
  SESSION_CHANGED: 409,
  IDENTITY_IN_USE: 409,
  ADOPTION_REQUIRED: 409,
  ADOPTION_CONFLICT: 409,
  ASSOCIATION_CHANGED: 409,
  PROOF_REPLAYED: 409,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  DISABLED: 503,
} as const;

export type PlatformAuthErrorCode = keyof typeof PLATFORM_AUTH_ERRORS;

/** Only `signed-in` and `restored` carry a new session; `not-linked` is a lookup that found nothing. */
export type PlatformAuthOutcome = "signed-in" | "restored" | "linked" | "associated" | "not-linked";

export interface PlatformAuthResult {
  readonly outcome: PlatformAuthOutcome;
}

/** What GameKit's identity-verification call returns; `timestamp` stays decimal text (UInt64). */
export interface GameCenterProof {
  readonly teamPlayerID: string;
  readonly bundleId: string;
  readonly publicKeyURL: string;
  readonly signatureBase64: string;
  readonly saltBase64: string;
  readonly timestamp: string;
}

export interface PlatformAuthBeginRequest {
  readonly provider: PlatformAuthProvider;
  readonly intent: PlatformAuthIntent;
}

export interface PlatformAuthBeginResponse {
  readonly attemptToken: string;
  readonly expiresAt: string;
}

export interface GameCenterAuthRequest {
  readonly attemptToken: string;
  readonly proof: GameCenterProof;
  /** The guest confirmed, before the flow began, that its progress moves into the account. */
  readonly adoptGuestProgress?: boolean;
}

export interface PlayGamesAuthRequest {
  readonly attemptToken: string;
  readonly serverAuthCode: string;
  /** The pointer version the player confirmed replacing (STO-592). */
  readonly expectedVersion?: number;
}

const TOKEN_MAX = 128;

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some((key) => !required.includes(key) && !optional.includes(key))) return null;
  if (required.some((key) => !keys.includes(key))) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

export function parseBeginRequest(body: unknown): PlatformAuthBeginRequest | null {
  const fields = record(body, ["provider", "intent"]);
  if (!fields || !Object.hasOwn(PLATFORM_AUTH_INTENTS, fields.provider as string)) return null;
  const provider = fields.provider as PlatformAuthProvider;
  const intents: readonly string[] = PLATFORM_AUTH_INTENTS[provider];
  return intents.includes(fields.intent as string) ? { provider, intent: fields.intent as PlatformAuthIntent } : null;
}

/** Shape and bounds only; the server's verifier checks encodings, freshness and the signature. */
function parseGameCenterProof(value: unknown): GameCenterProof | null {
  const proof = record(value, ["teamPlayerID", "bundleId", "publicKeyURL", "signatureBase64", "saltBase64", "timestamp"]);
  if (!proof) return null;
  const { teamPlayerID, bundleId, publicKeyURL, signatureBase64, saltBase64, timestamp } = proof;
  if (!text(teamPlayerID, 256) || !text(bundleId, 256) || !text(publicKeyURL, 2048)) return null;
  if (!text(signatureBase64, 1368) || !text(saltBase64, 344) || !text(timestamp, 20) || !/^\d+$/.test(timestamp)) return null;
  return { teamPlayerID, bundleId, publicKeyURL, signatureBase64, saltBase64, timestamp };
}

export function parseGameCenterRequest(body: unknown): GameCenterAuthRequest | null {
  const fields = record(body, ["attemptToken", "proof"], ["adoptGuestProgress"]);
  if (!fields || !text(fields.attemptToken, TOKEN_MAX)) return null;
  if (fields.adoptGuestProgress !== undefined && typeof fields.adoptGuestProgress !== "boolean") return null;
  const proof = parseGameCenterProof(fields.proof);
  return proof ? { attemptToken: fields.attemptToken, proof, adoptGuestProgress: fields.adoptGuestProgress === true } : null;
}

export function parsePlayGamesRequest(body: unknown): PlayGamesAuthRequest | null {
  const fields = record(body, ["attemptToken", "serverAuthCode"], ["expectedVersion"]);
  if (!fields || !text(fields.attemptToken, TOKEN_MAX) || !text(fields.serverAuthCode, 4096)) return null;
  const { expectedVersion } = fields;
  if (expectedVersion !== undefined && !(Number.isSafeInteger(expectedVersion) && (expectedVersion as number) > 0)) return null;
  return {
    attemptToken: fields.attemptToken,
    serverAuthCode: fields.serverAuthCode,
    ...(expectedVersion === undefined ? {} : { expectedVersion: expectedVersion as number }),
  };
}
