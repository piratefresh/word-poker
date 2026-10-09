import {
  WAITING_PHASE,
  WORD_CHECKS_PER_HAND,
  type GameTableConfig,
  type PrivatePowerState,
  type PrivatePowerSwap,
  type PrivateSeatState,
  type PrivateWordState,
} from "@wordpoker/contracts";
import type { Tile } from "@wordpoker/contracts";
import { buildPots, canUsePower, playedWord, type OfflineState } from "@wordpoker/game-rules";

import {
  BettingState,
  ComparisonState,
  ComparisonValueState,
  GameRoomState,
  HandResultState,
  PotState,
  SeatState,
  StackDeltaState,
  StandingState,
  TableConfigState,
  TileState,
  WordSlotState,
  WordWindowState,
} from "./schema/GameRoomState.js";

export interface ProjectionBinding {
  readonly playerId: string;
  readonly seat: number;
  readonly connected: boolean;
  readonly tableStack: number;
  readonly ready: boolean;
}

export interface GameRoomProjectionInput {
  readonly table: GameTableConfig;
  readonly game: OfflineState | null;
  readonly bindings: readonly ProjectionBinding[];
  readonly now: number;
}

export interface PrivateStateInput {
  readonly game: OfflineState | null;
  readonly binding: ProjectionBinding;
  readonly now: number;
}

/**
 * Deep schema adapter for the room. It is the only module that knows how domain nulls, private
 * values, and showdown data are represented by the synchronized Colyseus projection.
 */
export class GameRoomProjection {
  constructor(private readonly state: GameRoomState) {}

  project(input: GameRoomProjectionInput): void {
    this.state.now = input.now;
    this.projectTable(input);
    this.projectSeats(input);
    this.projectCommunity(input);
    this.projectBetting(input);
    this.projectPots(input);
    this.projectWordWindow(input);
    this.projectResult(input);
  }

  privateState(input: PrivateStateInput): PrivateSeatState {
    // The engine's seat index is its own (present seats, in order), not the table seat number:
    // find the seat by player id, as the word window does, so the rack sent is the one it judges.
    const index = input.game?.seats.findIndex((candidate) => candidate.id === input.binding.playerId) ?? -1;
    const seat = index < 0 ? undefined : input.game?.seats[index];
    const activeTurn =
      seat !== undefined && input.game?.wordWindow?.status !== "open" && input.game?.toActIndex === index;
    // Spread rather than set to `undefined`: a Classic seat's message carries no power key at all.
    const power = privatePowerState(input.game, input.binding.playerId, input.now);

    return {
      ...(power === undefined ? {} : { power }),
      now: input.now,
      playerId: input.binding.playerId,
      seat: input.binding.seat,
      tableStack: seat?.stack ?? input.binding.tableStack,
      hand: input.game?.hand ?? 0,
      rack: seat?.privateTiles.map((tile) => ({ ...tile })) ?? [],
      word: privateWordState(input.game, input.binding.playerId),
      wordCheck:
        input.game?.wordChecks[input.binding.playerId] ?? {
          checksRemaining: WORD_CHECKS_PER_HAND,
          result: null,
        },
      isYourTurn: activeTurn,
      turnDeadline: activeTurn ? input.game?.endsAtMs ?? 0 : 0,
    };
  }

  private projectTable(input: GameRoomProjectionInput): void {
    const table: TableConfigState = this.state.table;
    table.name = input.table.name;
    table.buyIn = input.table.buyIn;
    table.smallBlind = input.table.smallBlind;
    table.bigBlind = input.table.bigBlind;
    table.maxSeats = input.table.maxSeats;
    table.powerUps.deal = input.table.powerUps.deal;

    this.state.phase = input.game?.phase ?? WAITING_PHASE;
    this.state.sessionOver = input.game?.sessionOver ?? false;
    this.state.handCount = input.game?.hand ?? 0;
    this.state.dealerSeat = input.game?.dealerSeat ?? -1;
    this.state.toActSeat = input.game?.toActIndex ?? -1;
    const turnOpen = input.game?.betting != null && input.game?.toActIndex != null;
    this.state.turnDeadline = turnOpen ? input.game?.endsAtMs ?? 0 : 0;
  }

  private projectSeats(input: GameRoomProjectionInput): void {
    this.state.seats.clear();
    const gameById = new Map(input.game?.seats.map((seat) => [seat.id, seat]) ?? []);

    for (const binding of input.bindings) {
      const engineSeat = gameById.get(binding.playerId);
      const seat = new SeatState();
      seat.seat = binding.seat;
      seat.playerId = binding.playerId;
      seat.connected = binding.connected;
      seat.tableStack = engineSeat?.stack ?? binding.tableStack;
      seat.committedThisRound = engineSeat?.committedRound ?? 0;
      seat.committedThisHand = engineSeat?.committedHand ?? 0;
      seat.isAllIn = engineSeat?.allIn ?? false;
      seat.hasFolded = engineSeat?.folded ?? false;
      seat.sittingOut = engineSeat?.sittingOut ?? false;
      seat.actedThisRound = engineSeat?.actedThisRound ?? false;
      seat.ready = binding.ready;
      this.state.seats.set(binding.playerId, seat);
    }
  }

  private projectCommunity(input: GameRoomProjectionInput): void {
    this.state.community.splice(0, this.state.community.length);
    const community = input.game?.community.slice(0, input.game.revealed) ?? [];
    for (const tile of community) this.state.community.push(projectTile(tile));
  }

  private projectBetting(input: GameRoomProjectionInput): void {
    const projection: BettingState = this.state.betting;
    const betting = input.game?.betting;
    projection.active = betting !== null && betting !== undefined;
    // The round's floor is the table's big blind (§22): the engine's own stakes while a hand is
    // dealt, and the table's config before the first deal.
    projection.bigBlind = input.game?.stakes.bigBlind ?? input.table.bigBlind;
    projection.currentBet = betting?.currentBet ?? 0;
    projection.minRaise =
      betting === null || betting === undefined
        ? 0
        : Math.max(betting.lastRaiseSize, projection.bigBlind);
  }

  private projectPots(input: GameRoomProjectionInput): void {
    this.state.pots.splice(0, this.state.pots.length);
    if (input.game === null) return;

    for (const pot of buildPots(input.game.seats)) {
      this.state.pots.push(
        projectPot({
          amount: pot.amount,
          eligible: pot.eligible.map((index) => input.game?.seats[index]?.id ?? ""),
          winners: [],
          ranking: null,
        }),
      );
    }
  }

  private projectWordWindow(input: GameRoomProjectionInput): void {
    const projection: WordWindowState = this.state.wordWindow;
    const window = input.game?.wordWindow;
    projection.active = window !== null && window !== undefined;
    projection.status = window?.status ?? "none";
    projection.now = input.now;
    projection.deadline =
      window?.status === "open" || window?.status === "settled"
        ? input.game?.endsAtMs ?? 0
        : 0;
    projection.slots.splice(0, projection.slots.length);

    for (const slot of window?.slots ?? []) {
      const projected = new WordSlotState();
      projected.playerId = slot.playerId;
      projected.status = slot.status;
      projection.slots.push(projected);
    }
  }

  private projectResult(input: GameRoomProjectionInput): void {
    const projection: HandResultState = this.state.result;
    const result = input.game?.result;
    projection.available = result !== null && result !== undefined;
    projection.winner = result?.winner ?? "";
    projection.standings.splice(0, projection.standings.length);
    projection.comparisons.splice(0, projection.comparisons.length);
    projection.pots.splice(0, projection.pots.length);
    projection.stackDeltas.splice(0, projection.stackDeltas.length);
    if (result === null || result === undefined) return;

    for (const standing of result.standings) {
      const projected = new StandingState();
      projected.playerId = standing.playerId;
      projected.seat = standing.seat;
      projected.score = standing.score;
      projected.place = standing.place;
      projected.decidedBy = standing.decidedBy;
      projected.compared = standing.compared ?? 0;
      projected.hasCompared = standing.compared !== null;
      projected.word = standing.word ?? "";
      projected.reason = standing.reason ?? "";
      // The reveal is §7's own breakdown out of the engine, so the felt never re-prices a word.
      const played = input.game === null ? null : playedWord(input.game, standing.seat);
      for (const tile of played?.tiles ?? []) projected.tiles.push(projectTile(tile));
      projected.base = played?.base ?? 0;
      projected.mult = played?.mult ?? 0;
      projected.rack = played?.rack ?? 0;
      projection.standings.push(projected);
    }

    for (const comparison of result.comparisons) {
      const projected = new ComparisonState();
      projected.step = comparison.step;
      projected.round = comparison.round;
      for (const value of comparison.values) {
        const item = new ComparisonValueState();
        item.playerId = value.playerId;
        item.value = value.value ?? 0;
        item.hasValue = value.value !== null;
        projected.values.push(item);
      }
      comparison.advanced.forEach((playerId) => projected.advanced.push(playerId));
      projection.comparisons.push(projected);
    }

    for (const pot of result.payout.pots) projection.pots.push(projectPot(pot));
    for (const delta of result.payout.stackDeltas) {
      const projected = new StackDeltaState();
      projected.playerId = delta.playerId;
      projected.start = delta.start;
      projected.end = delta.end;
      projection.stackDeltas.push(projected);
    }
  }
}

function projectTile(tile: Tile): TileState {
  const projected = new TileState();
  projected.kind = "alternativeLetter" in tile ? "choice" : "letter";
  projected.id = tile.id;
  projected.letter = tile.letter;
  projected.points = tile.points;
  projected.alternativeLetter = "alternativeLetter" in tile ? tile.alternativeLetter : "";
  projected.alternativePoints = "alternativePoints" in tile ? tile.alternativePoints : 0;
  projected.multiplier = tile.multiplier ?? "";
  return projected;
}

function projectPot(pot: {
  amount: number;
  eligible: readonly string[];
  winners: readonly string[];
  ranking: unknown;
}): PotState {
  const projected = new PotState();
  projected.amount = pot.amount;
  pot.eligible.forEach((playerId) => projected.eligible.push(playerId));
  pot.winners.forEach((playerId) => projected.winners.push(playerId));
  projected.rankingJson = pot.ranking === null ? "" : JSON.stringify(pot.ranking);
  return projected;
}

/**
 * What a swap power did, as its owner is told it (§44). The discarded tile is only ever an id —
 * its letter is never sent anywhere, the owner included.
 */
export function privatePowerSwap(game: OfflineState, playerId: string): PrivatePowerSwap | null {
  const held = game.powers?.held[playerId];
  if (held?.swap === undefined) return null;
  return {
    handId: game.hand,
    powerUpId: held.id,
    discardedTileId: held.swap.discardedTileId,
    tile: { ...held.swap.tile },
  };
}

/**
 * One seat's side of a Wild hand (§44): its open draw, its held power and whether it can use it
 * now — the engine's `canUsePower`, never the client's guess — and its swap. `undefined` at a
 * Classic table and for a seat the draw passed over, so neither carries a power field.
 */
function privatePowerState(
  game: OfflineState | null,
  playerId: string,
  now: number,
): PrivatePowerState | undefined {
  const powers = game?.powers;
  const slot = powers?.draw.slots.find((candidate) => candidate.playerId === playerId);
  if (game == null || powers === undefined || slot === undefined) return undefined;

  const held = powers.held[playerId];
  return {
    handId: game.hand,
    draw:
      powers.draw.status === "open"
        ? { offers: [...slot.offers], picked: slot.picked, deadline: powers.draw.endsAtMs }
        : null,
    held:
      held === undefined
        ? null
        : { powerUpId: held.id, used: held.used, usable: canUsePower(game, playerId, now) },
    swap: privatePowerSwap(game, playerId),
  };
}

function privateWordState(game: OfflineState | null, playerId: string): PrivateWordState {
  const slot = game?.wordWindow?.slots.find((candidate) => candidate.playerId === playerId);
  if (slot === undefined) {
    return { status: "none", draft: null, confirmed: null };
  }
  if (slot.status === "confirmed") {
    return { status: "confirmed", draft: null, confirmed: slot.submission };
  }
  if (slot.status === "drafting") {
    return { status: "drafting", draft: slot.draft, confirmed: null };
  }
  return { status: "timed-out", draft: null, confirmed: null };
}
