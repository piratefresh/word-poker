/** The pure, deterministic engine: no I/O, no framework, no ambient clock or randomness. */

export { createRng } from "./rng";
export { COMMUNITY_TILE_COUNT, PRIVATE_TILES_PER_PLAYER, dealHand, shuffle } from "./deal";
export { NotEnoughTilesError, TILE_BAG_SIZE, createTileBag, draw } from "./tiles";
export { decideOfflineMove } from "./bot";
export {
  OFFLINE_TURN_MS,
  OfflineActionError,
  reduce,
  revealedCount,
  startHand,
} from "./offline";
export type { OfflineSeat, OfflineState, StartHandOptions } from "./offline";
export { NoPlayersError, pickWinner, scoreHand } from "./scoring";
export type { ScoredPlayer } from "./scoring";
