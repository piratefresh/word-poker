import { schema, t, type SchemaType } from "@colyseus/schema";
import { WAITING_PHASE } from "@wordpoker/contracts";

/** A tile projection. `kind` names the variant; `alternative*` is empty unless the kind is `choice`. */
export const TileState = schema({
  kind: t.string().default("letter"),
  id: t.string().default(""),
  letter: t.string().default(""),
  points: t.uint8().default(0),
  alternativeLetter: t.string().default(""),
  alternativePoints: t.uint8().default(0),
  multiplier: t.string().default(""),
}, "TileState");
export type TileState = SchemaType<typeof TileState>;

/** Immutable room configuration, nested to keep the root schema small. */
export const TableConfigState = schema({
  name: t.string().default(""),
  buyIn: t.uint32().default(0),
  smallBlind: t.uint32().default(0),
  bigBlind: t.uint32().default(0),
  maxSeats: t.uint8().default(0),
}, "TableConfigState");
export type TableConfigState = SchemaType<typeof TableConfigState>;

/** One public seat. The rack and word draft are deliberately absent. */
export const SeatState = schema({
  seat: t.uint8().default(0),
  playerId: t.string().default(""),
  connected: t.boolean().default(false),
  tableStack: t.uint32().default(0),
  committedThisRound: t.uint32().default(0),
  committedThisHand: t.uint32().default(0),
  isAllIn: t.boolean().default(false),
  hasFolded: t.boolean().default(false),
  sittingOut: t.boolean().default(false),
  actedThisRound: t.boolean().default(false),
  ready: t.boolean().default(false),
}, "SeatState");
export type SeatState = SchemaType<typeof SeatState>;

/** The currently open betting numbers. `active` represents the domain null. */
export const BettingState = schema({
  active: t.boolean().default(false),
  bigBlind: t.uint32().default(0),
  currentBet: t.uint32().default(0),
  minRaise: t.uint32().default(0),
}, "BettingState");
export type BettingState = SchemaType<typeof BettingState>;

/** One live or settled pot layer, with player ids rather than engine seat indexes. */
export const PotState = schema({
  amount: t.uint32().default(0),
  eligible: t.array("string"),
  winners: t.array("string"),
  /** Ranking is optional on a fold-out; it is encoded only in the settled result. */
  rankingJson: t.string().default(""),
}, "PotState");
export type PotState = SchemaType<typeof PotState>;

/** Public word-window status; submission text stays in targeted private messages. */
export const WordSlotState = schema({
  playerId: t.string().default(""),
  status: t.string().default("drafting"),
}, "WordSlotState");
export type WordSlotState = SchemaType<typeof WordSlotState>;

export const WordWindowState = schema({
  active: t.boolean().default(false),
  status: t.string().default("none"),
  now: t.number().default(0),
  deadline: t.number().default(0),
  slots: t.array(WordSlotState),
}, "WordWindowState");
export type WordWindowState = SchemaType<typeof WordWindowState>;

/** A showdown standing with nullable wire values represented by explicit flags. */
export const StandingState = schema({
  playerId: t.string().default(""),
  seat: t.uint8().default(0),
  score: t.uint32().default(0),
  place: t.uint16().default(0),
  decidedBy: t.string().default(""),
  compared: t.number().default(0),
  hasCompared: t.boolean().default(false),
  word: t.string().default(""),
  reason: t.string().default(""),
  /** The reveal: the tiles the seat's word played, in word order (§20). */
  tiles: t.array(TileState),
  base: t.uint32().default(0),
  mult: t.uint32().default(0),
  rack: t.uint32().default(0),
}, "StandingState");
export type StandingState = SchemaType<typeof StandingState>;

export const ComparisonValueState = schema({
  playerId: t.string().default(""),
  value: t.number().default(0),
  hasValue: t.boolean().default(false),
}, "ComparisonValueState");
export type ComparisonValueState = SchemaType<typeof ComparisonValueState>;

export const ComparisonState = schema({
  step: t.string().default(""),
  round: t.uint16().default(0),
  values: t.array(ComparisonValueState),
  advanced: t.array("string"),
}, "ComparisonState");
export type ComparisonState = SchemaType<typeof ComparisonState>;

export const StackDeltaState = schema({
  playerId: t.string().default(""),
  start: t.uint32().default(0),
  end: t.uint32().default(0),
}, "StackDeltaState");
export type StackDeltaState = SchemaType<typeof StackDeltaState>;

/** The settled result retained at payout. */
export const HandResultState = schema({
  available: t.boolean().default(false),
  winner: t.string().default(""),
  standings: t.array(StandingState),
  comparisons: t.array(ComparisonState),
  pots: t.array(PotState),
  stackDeltas: t.array(StackDeltaState),
}, "HandResultState");
export type HandResultState = SchemaType<typeof HandResultState>;

/**
 * The synchronized public projection of the domain table. Every mutable game value is nested
 * by concern, leaving private tiles and drafts outside the broadcast schema entirely.
 */
export const GameRoomState = schema({
  table: TableConfigState,
  phase: t.string().default(WAITING_PHASE),
  sessionOver: t.boolean().default(false),
  now: t.number().default(0),
  handCount: t.uint16().default(0),
  dealerSeat: t.int8().default(-1),
  toActSeat: t.int8().default(-1),
  turnDeadline: t.number().default(0),
  seats: t.map(SeatState),
  community: t.array(TileState),
  betting: BettingState,
  pots: t.array(PotState),
  wordWindow: WordWindowState,
  result: HandResultState,
}, "GameRoomState");
export type GameRoomState = SchemaType<typeof GameRoomState>;
