/**
 * tile-sets-provider.tsx — the signed-in player's tile sets, held once for the app (STO-1045).
 *
 * Mounted in `src/app/_layout.tsx` beside `QuestsProvider`. It reads `/api/tile-sets` once per
 * account and keeps the equipped set on the device under that account, so a table opened offline,
 * or before the read lands, still draws the player's own set. The server stays the authority: an
 * equip shows at once and is put back if the server refuses it.
 *
 * It also provides `TileSetPaint`, which every `Tile` reads: tiles anywhere in the app wear the
 * equipped set unless a nearer provider (a store preview) names another.
 */

import {
  DEFAULT_TILE_SET,
  isTileSetId,
  type TileSetId,
  type TileSetsResponse,
} from "@wordpoker/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { authClient } from "@/auth/client/auth-client";
import { readItem, writeItem } from "@/lib/storage/claim-store";
import { fetchTileSets, sendTileSetRequest, type TileSetResult } from "@/lib/wallet/wallet-client";

import { TileSetPaint } from "./tile-set-paint";

export interface TileSetsValue {
  /** `null` until the first read lands, and while signed out. */
  readonly state: TileSetsResponse | null;
  /** The set tiles wear: the server's once read, the device's copy before that, else the default. */
  readonly equipped: TileSetId;
  /** Buys a set (which also equips it). The new balance, when coins were taken, rides `state.coins`. */
  readonly buy: (tileSet: TileSetId) => Promise<TileSetResult>;
  readonly equip: (tileSet: TileSetId) => Promise<TileSetResult>;
}

const DEFAULT_VALUE: TileSetsValue = {
  state: null,
  equipped: DEFAULT_TILE_SET,
  buy: async () => ({ ok: false, reason: "not_owned", message: "Sign in to buy tile sets." }),
  equip: async () => ({ ok: false, reason: "not_owned", message: "Sign in to equip tile sets." }),
};

const TileSetsContext = createContext<TileSetsValue>(DEFAULT_VALUE);

export function useTileSets(): TileSetsValue {
  return useContext(TileSetsContext);
}

const storageKey = (userId: string) => `tile-set:${userId}`;

function storedEquipped(userId: string | undefined): TileSetId {
  if (!userId) return DEFAULT_TILE_SET;
  try {
    const stored = readItem(storageKey(userId));

    return isTileSetId(stored) ? stored : DEFAULT_TILE_SET;
  } catch {
    return DEFAULT_TILE_SET;
  }
}

function storeEquipped(userId: string, tileSet: TileSetId): void {
  try {
    writeItem(storageKey(userId), tileSet);
  } catch {
    // The device copy only saves a flash of the default set; the server read still lands.
  }
}

export function TileSetsProvider({ children }: { children: ReactNode }): ReactElement {
  const { data: session } = authClient.useSession();
  const userId = session?.user.isAnonymous ? undefined : session?.user.id;
  // Keyed by account, so a sign-out or a switch never shows the last player's sets.
  const [read, setRead] = useState<{ userId: string; state: TileSetsResponse } | null>(null);
  const userRef = useRef(userId);
  userRef.current = userId;

  const accept = useCallback((forUser: string, state: TileSetsResponse) => {
    if (userRef.current !== forUser) return;
    setRead({ userId: forUser, state });
    storeEquipped(forUser, state.equipped);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let current = true;
    fetchTileSets()
      .then((state) => current && accept(userId, state))
      .catch(() => {
        // Signed out, or the store is down: tiles keep the device's copy until the next account read.
      });

    return () => {
      current = false;
    };
  }, [accept, userId]);

  const state = read !== null && read.userId === userId ? read.state : null;
  const equipped = state?.equipped ?? storedEquipped(userId);

  const send = useCallback(
    async (action: "buy" | "equip", tileSet: TileSetId): Promise<TileSetResult> => {
      const forUser = userRef.current;
      if (!forUser) return DEFAULT_VALUE[action](tileSet);
      const result = await sendTileSetRequest({ action, tileSet });
      if (result.ok) accept(forUser, result.state);

      return result;
    },
    [accept],
  );

  const equip = useCallback(
    async (tileSet: TileSetId): Promise<TileSetResult> => {
      const forUser = userRef.current;
      const before = read?.userId === forUser ? read?.state : undefined;
      // Owned sets equip at once (the store's EQUIP has no sheet); a refusal puts the old one back.
      if (forUser && before?.owned.includes(tileSet)) setRead({ userId: forUser, state: { ...before, equipped: tileSet } });
      try {
        const result = await send("equip", tileSet);
        if (!result.ok && forUser && before) setRead({ userId: forUser, state: before });

        return result;
      } catch (error) {
        if (forUser && before) setRead({ userId: forUser, state: before });
        throw error;
      }
    },
    [read, send],
  );

  const buy = useCallback((tileSet: TileSetId) => send("buy", tileSet), [send]);

  const value = useMemo<TileSetsValue>(() => ({ state, equipped, buy, equip }), [state, equipped, buy, equip]);

  return (
    <TileSetsContext.Provider value={value}>
      <TileSetPaint.Provider value={equipped}>{children}</TileSetPaint.Provider>
    </TileSetsContext.Provider>
  );
}
