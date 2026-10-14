/**
 * platform-auth.ts — the app's handle on Game Center (iOS) and Play Games (Android, STO-592).
 *
 * Native code only produces evidence; the server verifies it. Builds without the native module
 * (Expo Go, Jest) report `unavailable` and reject with `UNAVAILABLE` rather than crash.
 */
import { requireOptionalNativeModule, type NativeModule } from "expo";

import type { GameCenterProof, PlatformAuthState, PlatformAuthSubscription } from "./types";

export type * from "./types";

declare class PlatformAuthNative extends NativeModule<{ onAuthStateChange: (state: PlatformAuthState) => void }> {
  getState(): Promise<PlatformAuthState>;
  authenticate(): Promise<PlatformAuthState>;
  getGameCenterProof(): Promise<GameCenterProof>;
  getPlayGamesServerAuthCode(): Promise<{ serverAuthCode: string }>;
}

const native = requireOptionalNativeModule<PlatformAuthNative>("PlatformAuth");

const UNAVAILABLE: PlatformAuthState = { provider: null, status: "unavailable" };

function missing(): Promise<never> {
  return Promise.reject(Object.assign(new Error("Platform sign-in is not in this build."), { code: "UNAVAILABLE" }));
}

/** Reads the current state without presenting anything. */
export function getState(): Promise<PlatformAuthState> {
  return native ? native.getState() : Promise.resolve(UNAVAILABLE);
}

/** May present the platform's own sign-in UI. Concurrent calls share one attempt. */
export function authenticate(): Promise<PlatformAuthState> {
  return native ? native.authenticate() : missing();
}

/** A fresh, single-use identity proof; iOS only, and only while authenticated. */
export function getGameCenterProof(): Promise<GameCenterProof> {
  return native ? native.getGameCenterProof() : missing();
}

/** Android only (STO-592). */
export function getPlayGamesServerAuthCode(): Promise<{ serverAuthCode: string }> {
  return native ? native.getPlayGamesServerAuthCode() : missing();
}

/** Fires on sign-in, sign-out and a change of player. Never asks for a Word Poker session itself. */
export function addAuthStateListener(listener: (state: PlatformAuthState) => void): PlatformAuthSubscription {
  return native ? native.addListener("onAuthStateChange", listener) : { remove() {} };
}
