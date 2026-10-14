/** Web has no Game Center or Play Games: everything reports unavailable, with no native import. */
import type { GameCenterProof, PlatformAuthState, PlatformAuthSubscription } from "./types";

export type * from "./types";

function unavailable(): Promise<never> {
  return Promise.reject(Object.assign(new Error("Platform sign-in is not available on the web."), { code: "UNAVAILABLE" }));
}

export const getState = (): Promise<PlatformAuthState> => Promise.resolve({ provider: null, status: "unavailable" });
export const authenticate = (): Promise<PlatformAuthState> => unavailable();
export const getGameCenterProof = (): Promise<GameCenterProof> => unavailable();
export const getPlayGamesServerAuthCode = (): Promise<{ serverAuthCode: string }> => unavailable();
export const addAuthStateListener = (_listener: (state: PlatformAuthState) => void): PlatformAuthSubscription => ({ remove() {} });
