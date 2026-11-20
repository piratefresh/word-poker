/**
 * production-guard.ts — keeps local runs off the production database.
 *
 * PlanetScale routes a connection by its username, `{role}.{branch_id}`, so the branch is the part
 * after the last dot. A local `.env` names the production branch in `PRODUCTION_DATABASE_BRANCH_ID`
 * (the repo is public, so the id is not committed), and any connection whose user ends in it is
 * refused unless `ALLOW_PROD_DB=1`. Production never sets the variable, so this is a no-op there.
 *
 * Plain erasable TypeScript: `scripts/seed-test-user.mjs` imports it under Node's own type stripping.
 */

/** Throws when any target (a connection URL or a bare username) is the production branch. */
export function assertNotProductionDatabase(...targets: (string | undefined)[]): void {
  const branch = process.env.PRODUCTION_DATABASE_BRANCH_ID;
  if (!branch || process.env.ALLOW_PROD_DB === "1") return;

  for (const target of targets) {
    if (target && databaseUser(target).endsWith(`.${branch}`)) {
      throw new Error(
        "Refusing to connect to the production database from a local run. Point DATABASE_URL / DATABASE_USER " +
          "at the dev branch, or set ALLOW_PROD_DB=1 if production is really the target.",
      );
    }
  }
}

function databaseUser(target: string): string {
  try {
    return decodeURIComponent(new URL(target).username);
  } catch {
    return target;
  }
}
