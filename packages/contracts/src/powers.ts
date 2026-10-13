/**
 * powers.ts — the power-up vocabulary (docs/rules/power-ups.md §44): the one catalog every power
 * is defined in, and the room setting that decides how powers are dealt (§40).
 *
 * Nothing else defines a power. The Power Draw's cards, the held-power control, the felt's
 * "power used" card, the nameplate tag and the rules doc all read the entries below, so a power's
 * name, weight or window cannot disagree between two places.
 */

/** Every power a table can deal, in the order the catalog lists them. */
export const POWER_UP_IDS = ["random_wild", "vowel_magnet", "blank_tile", "spotlight"] as const;

/** One power's stable id — what a command names and an event reports. */
export type PowerUpId = (typeof POWER_UP_IDS)[number];

/**
 * How a power acts, so the engine dispatches on the family rather than on each id. `swapTile`:
 * discard one private tile, receive a plain one (§44, Swapping a Tile). `blankTile` is a swap whose
 * new tile is a blank. `spotlight` targets a dealt community tile and doubles it for everyone.
 */
export type PowerUpFamily = "swapTile" | "blankTile" | "spotlight";

/**
 * When a held power may be used. `ownTurnOrWordWindow`: on the seat's own betting turn before it
 * acts, or in §19's word window before it confirms (§44, Activation Windows).
 */
export type PowerUpWindow = "ownTurnOrWordWindow";

/** One catalog entry: everything the table, the felt and the rules say about a power. */
export interface PowerUpDefinition<Id extends PowerUpId = PowerUpId> {
  readonly id: Id;
  /** The card's name: "Random Wild". */
  readonly title: string;
  /** The card's one line, shown in the draw and on the felt when the power is used. */
  readonly description: string;
  /**
   * What the power hands the seat, as the end of its confirm: "Discard A for {receives}?".
   * Lower case and unpunctuated, so it reads inside that sentence.
   */
  readonly receives: string;
  /** The nameplate's short tag for the street the power was used on. */
  readonly tag: string;
  /** Which art the app draws the card with; a key, so contracts carry no asset paths. */
  readonly icon: string;
  /** The Power Draw's weight: a higher weight turns up among the three offers more often. */
  readonly weight: number;
  readonly window: PowerUpWindow;
  readonly family: PowerUpFamily;
  /** Whether the power acts on another seat. No v1 power does; Chaos (§40) may allow them. */
  readonly hostile: boolean;
}

/** §44's v1 catalog, keyed by id. */
export const POWER_UPS: { readonly [Id in PowerUpId]: PowerUpDefinition<Id> } = {
  random_wild: {
    id: "random_wild",
    title: "Wild Tile",
    description: "Swap one of your tiles for a random letter.",
    receives: "a random letter",
    tag: "WILD",
    icon: "random-wild",
    weight: 10,
    window: "ownTurnOrWordWindow",
    family: "swapTile",
    hostile: false,
  },
  vowel_magnet: {
    id: "vowel_magnet",
    title: "Vowel Magnet",
    description: "Swap one of your tiles for a random vowel.",
    receives: "a random vowel",
    tag: "VOWEL",
    icon: "vowel-magnet",
    weight: 8,
    window: "ownTurnOrWordWindow",
    family: "swapTile",
    hostile: false,
  },
  blank_tile: {
    id: "blank_tile",
    title: "Blank Tile",
    description: "Make one of your tiles any letter. It scores 0.",
    receives: "a blank tile",
    tag: "BLANK",
    icon: "blank-tile",
    weight: 8,
    window: "ownTurnOrWordWindow",
    family: "blankTile",
    hostile: false,
  },
  spotlight: {
    id: "spotlight",
    title: "Spotlight",
    description: "Pick one table tile. It scores double for everyone this hand.",
    receives: "a double",
    tag: "SPOTLIGHT",
    icon: "spotlight",
    weight: 8,
    window: "ownTurnOrWordWindow",
    family: "spotlight",
    hostile: false,
  },
};

/** Whether an untrusted value names a power in the catalog. */
export function isPowerUpId(value: unknown): value is PowerUpId {
  return (POWER_UP_IDS as readonly unknown[]).includes(value);
}

/** How many powers the Power Draw offers each seat (§44): every power in the catalog. */
export const POWER_DRAW_OFFER_COUNT = POWER_UP_IDS.length;

/** The Power Draw's shared clock (§44): a constant to tune after playtests. */
export const POWER_DRAW_MS = 10_000;

/**
 * Every way a power action can be refused (§44): the Power Draw's four, then using a held power's.
 * A string union for the same reason as the
 * betting and word reasons: these cross the wire into logs and UI copy.
 */
export const POWER_REJECTION_REASONS = [
  /** The seat was offered nothing this hand: no Power Draw ran, or the seat was not in it. */
  "not-in-draw",
  /** The pick names a power the seat was not offered. */
  "not-offered",
  /** The seat has already kept a power this hand; a pick is final. */
  "already-picked",
  /** The Power Draw has closed, or its clock has run out. */
  "draw-closed",
  /** The table deals no powers: it is Classic (§40). */
  "powers-off",
  /** The seat does not hold the power it named this hand. */
  "not-held",
  /** The seat has already used its power this hand; a power is used at most once. */
  "already-used",
  /**
   * Not the power's window: not the seat's own betting turn, the turn's clock has run out, the
   * Power Draw is still open, §19's window has run out, or the hand has paid out.
   */
  "outside-window",
  /** The seat has folded, and a folded seat's power is lost. */
  "folded",
  /** The seat has confirmed its word, and a confirmed word's tiles are locked. */
  "word-confirmed",
  /** The swap names a tile that is not one of the seat's private tiles. */
  "not-your-tile",
  /** Spotlight names a tile that is not a dealt community tile. */
  "not-a-table-tile",
  /** Spotlight names a tile that already carries a 2x or 3x bonus. */
  "already-bonus",
] as const;

/** Why a power action was refused. */
export type PowerRejectionReason = (typeof POWER_REJECTION_REASONS)[number];

/**
 * §40's deal modes a room can run today. `off` is Classic, `choose3` is Wild. Blind Draw, Sparse,
 * Chaos and Custom are planned; each joins this list when the engine can deal it.
 */
export const POWER_UP_DEAL_MODES = ["off", "choose3"] as const;

/** One of the deal modes a room can be created with. */
export type PowerUpDealMode = (typeof POWER_UP_DEAL_MODES)[number];

/**
 * A room's power-up setting. An object rather than a bare mode so the planned knobs — a host's
 * `pool` and a draw `frequency` (§40's Custom and Sparse) — can join it without reshaping what
 * rooms already store.
 */
export interface PowerUpSettings {
  readonly deal: PowerUpDealMode;
}

/** Power-ups are opt-in: a room that names no setting is Classic. */
export const DEFAULT_POWER_UP_SETTINGS: PowerUpSettings = { deal: "off" };

/** Whether an untrusted value is one of the deal modes a room can run. */
export function isPowerUpDealMode(value: unknown): value is PowerUpDealMode {
  return (POWER_UP_DEAL_MODES as readonly unknown[]).includes(value);
}

/**
 * Whether an untrusted value is a power-up setting. Keys this version does not know are allowed,
 * so a newer client's setting still reads; the validator is what drops them before storing.
 */
export function isPowerUpSettings(value: unknown): value is PowerUpSettings {
  return (
    typeof value === "object" &&
    value !== null &&
    isPowerUpDealMode((value as Record<string, unknown>).deal)
  );
}
