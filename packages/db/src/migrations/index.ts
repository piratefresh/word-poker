/**
 * index.ts — the migration list (STO-379, spec §6).
 *
 * `mikro-orm.config.ts` finds migrations by glob rather than through this barrel, because the
 * Migrator resolves them from `migrations.path`/`pathTs` and that is the form whose ordering
 * (file name, hence timestamp) is visible. This export is the same list in the form
 * `migrations.migrationsList` accepts, so a caller that would rather pass them explicitly
 * (a test, or a build with no readable source tree) does not have to re-type them.
 *
 * The glob is deliberately narrower than the `!(*.d).{js,ts}` default: it matches `Migration*`
 * so that this file is never mistaken for one — the migrator instantiates the first export that
 * is a function, which here would be a migration class run a second time.
 */

import type { Constructor } from "@mikro-orm/core";
import type { Migration } from "@mikro-orm/migrations";
import { Migration20261013140000_friends } from "./Migration20261013140000_friends";
export { Migration20261013140000_friends } from "./Migration20261013140000_friends";

import { Migration20260921030429_results_rating } from "./Migration20260921030429_results_rating";
import { Migration20261004120000_wallet_event } from "./Migration20261004120000_wallet_event";
import { Migration20261005120000_quests } from "./Migration20261005120000_quests";
import { Migration20261006120000_xp_levels } from "./Migration20261006120000_xp_levels";
import { Migration20261012120000_game_history } from "./Migration20261012120000_game_history";
import { Migration20261013120000_anonymous_user } from "./Migration20261013120000_anonymous_user";
import { Migration20261013130000_hand_seat_adopted_from } from "./Migration20261013130000_hand_seat_adopted_from";

export { Migration20260921030429_results_rating } from "./Migration20260921030429_results_rating";
export { Migration20261004120000_wallet_event } from "./Migration20261004120000_wallet_event";
export { Migration20261005120000_quests } from "./Migration20261005120000_quests";
export { Migration20261006120000_xp_levels } from "./Migration20261006120000_xp_levels";
export { Migration20261012120000_game_history } from "./Migration20261012120000_game_history";
export { Migration20261013120000_anonymous_user } from "./Migration20261013120000_anonymous_user";
export { Migration20261013130000_hand_seat_adopted_from } from "./Migration20261013130000_hand_seat_adopted_from";

/** Every migration this package has, oldest first. */
export const migrations: Constructor<Migration>[] = [
  Migration20260921030429_results_rating,
  Migration20261004120000_wallet_event,
  Migration20261005120000_quests,
  Migration20261006120000_xp_levels,
  Migration20261012120000_game_history,
  Migration20261013120000_anonymous_user,
  Migration20261013130000_hand_seat_adopted_from,
  Migration20261013140000_friends,
];
