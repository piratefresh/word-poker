/**
 * game-center.ts — Game Center sign-in, linking and launch restore on iOS (STO-591).
 *
 * The device signs in to Game Center, then (inside one session change) opens a server attempt,
 * asks GameKit for a fresh identity proof and trades it at `/platform-auth/game-center` for a
 * normal Better Auth session. The proof is single-use: every try, including a retry after a lost
 * response, fetches a new one. Local Game Center state never signs anyone in by itself.
 */

import type { PlatformAuthIntent } from "@wordpoker/contracts";
import { Platform } from "react-native";

import { pendingReferral } from "@/lib/pending-destination";

import * as platformAuth from "../../../modules/platform-auth/src/platform-auth";
import { authClient } from "./auth-client";
import { autoRestoreAllowed, changeSession, changeSessionIfSignedOut, setAutoRestore } from "./session-coordinator";

export const GAME_CENTER_AVAILABLE = Platform.OS === "ios";

export type GameCenterResult = { ok: true } | { ok: false; code: string; message: string };

const NATIVE_MESSAGES: Record<string, string> = {
  // After a cancel, GameKit often refuses again without showing anything; Settings is the way back.
  CANCELLED: "Game Center sign-in was cancelled. If nothing appeared, sign in under Settings › Game Center.",
  UNAVAILABLE: "Game Center isn't available on this device or account.",
  UNSUPPORTED: "Game Center isn't available on this device or account.",
  NO_ACTIVITY: "Game Center couldn't open. Try again.",
  NETWORK_ERROR: "Could not reach Game Center — check your connection and try again.",
};

function nativeFailure(error: unknown): GameCenterResult {
  const code = (error as { code?: unknown } | null)?.code;
  const known = typeof code === "string" ? code : "INTERNAL_ERROR";
  return { ok: false, code: known, message: NATIVE_MESSAGES[known] ?? "Game Center sign-in failed. Try again." };
}

function serverFailure(error: { code?: string; message?: string }): GameCenterResult {
  return { ok: false, code: error.code ?? "UNKNOWN", message: error.message ?? "Something went wrong. Please try again." };
}

/** Attempt → fresh proof → exchange. Runs inside a session change for sign-in, directly for link. */
async function exchange(intent: Extract<PlatformAuthIntent, "sign-in" | "link">, adoptGuestProgress: boolean): Promise<GameCenterResult> {
  const begun = await authClient.platformAuth.begin({ provider: "game-center", intent });
  if (begun.error) return serverFailure(begun.error);
  let proof;
  try {
    proof = await platformAuth.getGameCenterProof();
  } catch (error) {
    return nativeFailure(error);
  }
  // The inviter whose link brought this device here; only an account the server creates uses it.
  const ref = intent === "sign-in" ? pendingReferral() : null;
  const result = await authClient.platformAuth.gameCenter(
    { attemptToken: begun.data.attemptToken, proof, adoptGuestProgress },
    ref ? { "x-wordpoker-ref": ref } : undefined,
  );
  return result.error ? serverFailure(result.error) : { ok: true };
}

async function signedInToGameCenter(): Promise<GameCenterResult> {
  try {
    await platformAuth.authenticate();
    return { ok: true };
  } catch (error) {
    return nativeFailure(error);
  }
}

/**
 * The player tapped "Continue with Game Center". A guest must have agreed to move its hands
 * (`adoptGuestProgress`) and flushed them first, as for email sign-in.
 */
export async function signInWithGameCenter({ adoptGuestProgress }: { adoptGuestProgress: boolean }): Promise<GameCenterResult> {
  const native = await signedInToGameCenter();
  if (!native.ok) return native;
  const result = await changeSession(() => exchange("sign-in", adoptGuestProgress));
  if (result.ok) await setAutoRestore(true);
  return result;
}

/** Adds Game Center as a sign-in method of the permanent account on this device. No session change. */
export async function linkGameCenter(): Promise<GameCenterResult> {
  const native = await signedInToGameCenter();
  return native.ok ? exchange("link", false) : native;
}

let restore: Promise<boolean> | null = null;

/**
 * A signed-out launch on iOS signs straight back in with Game Center — once per launch (every call
 * shares the first attempt), never after the player chose guest play or signed out, and never over
 * a session that appeared meanwhile (an invite link's guest, say). Resolves whether it signed in;
 * failure leaves sign-in up.
 */
export function restoreWithGameCenter(): Promise<boolean> {
  restore ??= (async () => {
    // Development builds say why a launch stayed signed out; release builds stay quiet.
    const skipped = (reason: string) => {
      if (__DEV__) console.info(`[game-center] launch restore skipped: ${reason}`);
      return false;
    };
    if (!GAME_CENTER_AVAILABLE) return skipped("not iOS");
    if (!(await autoRestoreAllowed())) return skipped("guest play or sign-out chosen earlier");
    const native = await signedInToGameCenter();
    if (!native.ok) return skipped(`Game Center ${native.code}`);
    const result = await changeSessionIfSignedOut(() => exchange("sign-in", false)).catch(() => null);
    if (result === null) return skipped("a session appeared first, or the request failed");
    if (!result.ok) return skipped(`server ${result.code}`);
    return true;
  })();
  return restore;
}
