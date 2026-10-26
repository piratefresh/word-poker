/**
 * platform-auth.ts — Game Center sign-in/linking and Play Games restore as a Better Auth plugin
 * (STO-593). Server-only, like `auth.ts` that installs it.
 *
 * Native code produces evidence; the injected verifiers check it (STO-591 for Game Center, STO-592
 * for Play Games). A provider without a verifier answers `DISABLED`, so shipping this plugin changes
 * nothing until one is configured. Everything after verification — which account, whose guest
 * history, which restore pointer — commits in one Postgres transaction (`@wordpoker/db`), and only
 * then does Better Auth issue its normal session, so cookie, bearer, expiry and sign-out behave
 * exactly as they do for email sign-in.
 *
 *   POST /platform-auth/begin        { provider, intent }            → { attemptToken, expiresAt }
 *   POST /platform-auth/game-center  { attemptToken, proof, adoptGuestProgress? }
 *   POST /platform-auth/play-games   { attemptToken, serverAuthCode, expectedVersion? }
 *
 * An attempt binds intent and the starting session to a random token (stored hashed) for five
 * minutes, so a proof cannot be replayed under a different intent or after the session changed.
 * It is not a nonce Apple signed; the proof's own freshness and single use cover that.
 */

import { createHash, randomBytes } from "node:crypto";

import {
  PLATFORM_AUTH_ERRORS,
  isAccountEligible,
  parseBeginRequest,
  parseGameCenterRequest,
  parsePlayGamesRequest,
  type GameCenterProof,
  type PlatformAuthErrorCode,
  type PlatformAuthOutcome,
} from "@wordpoker/contracts";
import {
  ProofReplayedError,
  accountStanding,
  adoptGuestHistory,
  consumeAttempt,
  createProviderUser,
  dropRestorePointer,
  inTransaction,
  linkProvider,
  openAttempt,
  peekAttempt,
  pointRestore,
  providerOwner,
  restorePointer,
} from "@wordpoker/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { Pool } from "pg";

export interface VerifiedGameCenter {
  readonly teamPlayerId: string;
  /** SHA-256 of the signed payload and signature: what makes the proof single-use. */
  readonly proofHash: string;
  /** Unsigned and for display only; never used to pick an account. */
  readonly displayName?: string | undefined;
}

export interface VerifiedPlayGames {
  readonly applicationId: string;
  readonly playerId: string;
}

export interface PlatformVerifiers {
  readonly gameCenter?: ((proof: GameCenterProof) => Promise<VerifiedGameCenter>) | undefined;
  readonly playGames?: ((serverAuthCode: string) => Promise<VerifiedPlayGames>) | undefined;
}

/** What a verifier throws for evidence it refuses; anything else reads as the provider being down. */
export class PlatformAuthError extends Error {
  constructor(readonly code: PlatformAuthErrorCode) {
    super(code);
  }
}

/** An account a platform flow created or newly linked, handed to the app's referral/grant hooks. */
export interface ReadyAccount {
  readonly id: string;
  readonly isAnonymous: boolean;
  readonly emailVerified: boolean;
  readonly primaryIdentityVerified: boolean;
}

export interface PlatformAuthOptions {
  readonly pool: Pool;
  readonly verifiers: PlatformVerifiers;
  /**
   * Runs after the account change committed. Direct SQL skips Better Auth's database hooks, so
   * referral attribution and the welcome grant are called from here. Must not throw.
   */
  readonly onAccountReady?: (user: ReadyAccount, info: { created: boolean; headers: Headers | undefined }) => Promise<void>;
}

const MAX_BODY_BYTES = 16 * 1024;

const MESSAGES: Record<PlatformAuthErrorCode, string> = {
  INVALID_INPUT: "That request was not understood.",
  INVALID_PROOF: "The sign-in could not be verified.",
  PROOF_EXPIRED: "That sign-in expired. Try again.",
  SESSION_REQUIRED: "Sign in to your Word Poker account first.",
  SESSION_CHANGED: "Your session changed. Try again.",
  IDENTITY_IN_USE: "That account is already linked to a different Word Poker account.",
  ADOPTION_REQUIRED: "Confirm moving this guest's progress first.",
  ADOPTION_CONFLICT: "This guest's progress already moved to another account.",
  ASSOCIATION_CHANGED: "This Play Games profile restores a different Word Poker account.",
  PROOF_REPLAYED: "That sign-in was already used. Try again.",
  RATE_LIMITED: "Too many attempts. Try again in a minute.",
  PROVIDER_UNAVAILABLE: "Sign-in is unavailable right now. Try again soon.",
  DISABLED: "This sign-in method is not available.",
};

const STATUS_NAMES = { 400: "BAD_REQUEST", 401: "UNAUTHORIZED", 409: "CONFLICT", 429: "TOO_MANY_REQUESTS", 503: "SERVICE_UNAVAILABLE" } as const;

function fail(code: PlatformAuthErrorCode, extra: Record<string, unknown> = {}): APIError {
  return new APIError(STATUS_NAMES[PLATFORM_AUTH_ERRORS[code]], { code, message: MESSAGES[code], ...extra });
}

/** Trusts a declared length; otherwise counts a clone's chunks and stops reading past the cap. */
async function bodyTooLarge(request: Request): Promise<boolean> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared) return declared > MAX_BODY_BYTES;
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > MAX_BODY_BYTES) {
      // Not awaited: a tee branch's cancel settles only once the other branch is cancelled too.
      void reader.cancel().catch(() => {});
      return true;
    }
  }
  return false;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Runs a verifier; never echoes its error, which may carry upstream detail. */
async function verified<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof PlatformAuthError) throw fail(error.code);
    console.error(`[platform-auth] provider failed: ${error instanceof Error ? error.name : "unknown"}`);
    throw fail("PROVIDER_UNAVAILABLE");
  }
}

function replayed(error: unknown): never {
  throw error instanceof ProofReplayedError ? fail("PROOF_REPLAYED") : error;
}

const ok = (ctx: { setHeader: (name: string, value: string) => void; json: (body: object) => unknown }, outcome: PlatformAuthOutcome) => {
  ctx.setHeader("cache-control", "no-store");
  return ctx.json({ outcome });
};

export function platformAuth({ pool, verifiers, onAccountReady }: PlatformAuthOptions) {
  const ready = async (userId: string, created: boolean, headers: Headers | undefined) => {
    const standing = await accountStanding(pool, userId);
    if (standing && onAccountReady) await onAccountReady({ id: userId, ...standing }, { created, headers });
  };

  return {
    id: "platform-auth",
    // Per client IP in Better Auth's limiter, before any provider call; its storage is the database.
    rateLimit: [{ pathMatcher: (path: string) => path.startsWith("/platform-auth/"), window: 60, max: 10 }],
    onRequest: async (request: Request) => {
      if (!new URL(request.url).pathname.includes("/platform-auth/") || request.method !== "POST") return;
      if (!(await bodyTooLarge(request))) return;
      return {
        response: new Response(JSON.stringify({ code: "INVALID_INPUT", message: MESSAGES.INVALID_INPUT }), {
          status: 413,
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        }),
      };
    },
    endpoints: {
      platformAuthBegin: createAuthEndpoint("/platform-auth/begin", { method: "POST" }, async (ctx) => {
        const body = parseBeginRequest(ctx.body);
        if (!body) throw fail("INVALID_INPUT");
        if (!verifiers[body.provider === "game-center" ? "gameCenter" : "playGames"]) throw fail("DISABLED");

        const session = await getSessionFromCtx(ctx, { disableRefresh: true });
        const user = session?.user;
        // Which session each intent starts from: sign-in replaces none or a guest; restore only
        // ever runs signed out; linking and associating need the permanent account they change.
        if (body.intent === "sign-in" && user && !user.isAnonymous) throw fail("SESSION_CHANGED");
        if (body.intent === "restore" && session) throw fail("SESSION_CHANGED");
        if (body.intent === "link" && (!user || user.isAnonymous)) throw fail("SESSION_REQUIRED");
        if (body.intent === "associate" && !isAccountEligible(user)) throw fail("SESSION_REQUIRED");

        const attemptToken = randomBytes(32).toString("base64url");
        const expiresAt = await openAttempt(pool, {
          tokenHash: hash(attemptToken),
          provider: body.provider,
          intent: body.intent,
          sessionId: session?.session.id ?? null,
          userId: user?.id ?? null,
        });
        ctx.setHeader("cache-control", "no-store");
        return ctx.json({ attemptToken, expiresAt: expiresAt.toISOString() });
      }),

      platformAuthGameCenter: createAuthEndpoint("/platform-auth/game-center", { method: "POST" }, async (ctx) => {
        const verify = verifiers.gameCenter;
        if (!verify) throw fail("DISABLED");
        const body = parseGameCenterRequest(ctx.body);
        if (!body) throw fail("INVALID_INPUT");

        const session = await getSessionFromCtx(ctx, { disableRefresh: true });
        const sessionId = session?.session.id ?? null;
        const tokenHash = hash(body.attemptToken);
        const attempt = await peekAttempt(pool, tokenHash, "game-center");
        if (!attempt) throw fail("PROOF_EXPIRED");
        if (attempt.sessionId !== sessionId) throw fail("SESSION_CHANGED");
        const guestId = attempt.intent === "sign-in" && session?.user.isAnonymous ? session.user.id : null;
        if (guestId && !body.adoptGuestProgress) throw fail("ADOPTION_REQUIRED");

        const identity = await verified(() => verify(body.proof));
        const account = await inTransaction(pool, async (sql) => {
          const bound = await consumeAttempt(sql, tokenHash, "game-center", sessionId, identity.proofHash);
          if (!bound) throw fail("SESSION_CHANGED");
          if (bound.intent === "link") {
            if ((await linkProvider(sql, bound.userId!, "game-center", identity.teamPlayerId)) === "in-use") throw fail("IDENTITY_IN_USE");
            return { userId: bound.userId!, created: false };
          }
          const owner = await providerOwner(sql, "game-center", identity.teamPlayerId);
          const resolved = owner
            ? { userId: owner, created: false }
            : await createProviderUser(sql, {
                providerId: "game-center",
                accountId: identity.teamPlayerId,
                name: (body.displayName ?? identity.displayName)?.trim().slice(0, 32) || "Player",
              });
          if (guestId && !(await adoptGuestHistory(sql, guestId, resolved.userId))) throw fail("ADOPTION_CONFLICT");
          return resolved;
        }).catch(replayed);

        // As the anonymous plugin does after a link: the guest's rows have moved, so it goes.
        if (guestId) await ctx.context.internalAdapter.deleteUser(guestId).catch(() => console.error("[platform-auth] could not delete adopted guest"));
        await ready(account.userId, account.created, ctx.headers);
        if (attempt.intent === "link") return ok(ctx, "linked");
        await startSession(ctx, account.userId);
        return ok(ctx, "signed-in");
      }),

      platformAuthPlayGames: createAuthEndpoint("/platform-auth/play-games", { method: "POST" }, async (ctx) => {
        const verify = verifiers.playGames;
        if (!verify) throw fail("DISABLED");
        const body = parsePlayGamesRequest(ctx.body);
        if (!body) throw fail("INVALID_INPUT");

        const session = await getSessionFromCtx(ctx, { disableRefresh: true });
        const sessionId = session?.session.id ?? null;
        const tokenHash = hash(body.attemptToken);
        const attempt = await peekAttempt(pool, tokenHash, "play-games");
        if (!attempt) throw fail("PROOF_EXPIRED");
        if (attempt.sessionId !== sessionId) throw fail("SESSION_CHANGED");

        const identity = await verified(() => verify(body.serverAuthCode));
        const result = await inTransaction(pool, async (sql): Promise<{ outcome: PlatformAuthOutcome; userId?: string }> => {
          const bound = await consumeAttempt(sql, tokenHash, "play-games", sessionId);
          if (!bound) throw fail("SESSION_CHANGED");
          if (bound.intent === "associate") {
            if (!isAccountEligible(await accountStanding(sql, bound.userId!))) throw fail("SESSION_REQUIRED");
            const pointed = await pointRestore(sql, { ...identity, userId: bound.userId!, expectedVersion: body.expectedVersion });
            if (!pointed.associated) throw fail("ASSOCIATION_CHANGED", { version: pointed.version });
            return { outcome: "associated" };
          }
          // Restore: a pointer to an account that can no longer earn (or sign in) restores nothing.
          const pointer = await restorePointer(sql, identity.applicationId, identity.playerId);
          if (!pointer) return { outcome: "not-linked" };
          if (!isAccountEligible(await accountStanding(sql, pointer.userId))) {
            await dropRestorePointer(sql, identity.applicationId, identity.playerId, pointer.version);
            return { outcome: "not-linked" };
          }
          return { outcome: "restored", userId: pointer.userId };
        });

        if (result.userId) await startSession(ctx, result.userId);
        return ok(ctx, result.outcome);
      }),
    },
  } satisfies BetterAuthPlugin;
}

type EndpointContext = Parameters<typeof setSessionCookie>[0];

/** A normal Better Auth session for an account that already committed. */
async function startSession(ctx: EndpointContext, userId: string): Promise<void> {
  const user = await ctx.context.internalAdapter.findUserById(userId);
  const session = user ? await ctx.context.internalAdapter.createSession(userId) : null;
  if (!user || !session) throw fail("PROVIDER_UNAVAILABLE");
  await setSessionCookie(ctx, { session, user });
}
