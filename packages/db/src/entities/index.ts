/**
 * index.ts — every entity this package knows about (STO-379, spec §6).
 *
 * `mikro-orm.config.ts` imports the class from here, so an entity that is not re-exported does
 * not exist as far as the ORM — and the migrator — are concerned.
 */

export { ResultsRating, type ResultsRatingRow } from "./results-rating";
