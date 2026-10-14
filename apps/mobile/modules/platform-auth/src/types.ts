import type { GameCenterProof } from "@wordpoker/contracts";

export type { GameCenterProof };

/**
 * What the device's platform account looks like right now. Display only: never a session, never an
 * identity the server should trust — the server verifies proofs, not this.
 */
export interface PlatformAuthState {
  readonly provider: "game-center" | "play-games" | null;
  readonly status: "authenticated" | "signed-out" | "unavailable";
  readonly displayName?: string;
}

/** The `code` on every rejection from the native module. `CANCELLED` is the player's choice: retry is fine. */
export type PlatformAuthNativeError =
  | "CANCELLED"
  | "UNAVAILABLE"
  | "UNSUPPORTED"
  | "NOT_AUTHENTICATED"
  | "NO_ACTIVITY"
  | "BUSY"
  | "NETWORK_ERROR"
  | "INTERNAL_ERROR";

export interface PlatformAuthSubscription {
  remove(): void;
}
