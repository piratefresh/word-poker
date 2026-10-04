/**
 * backfill-welcome.ts — pays the welcome grant to every account that existed before it (STO-346).
 *
 * Email verification did not exist before the grant, so every row of Better Auth's `"user"` table
 * is paid, verified or not. Rerunnable: the welcome index makes a second grant a no-op, and a
 * still-`pending` row is re-sent under its own idempotency key.
 *
 *   pnpm --filter @wordpoker/economy exec tsx --env-file=../../apps/mobile/.env scripts/backfill-welcome.ts
 */

import { closeOrm, getOrm } from "@wordpoker/db";

import { grantWelcome, retryPending } from "../src/index";

async function main(): Promise<void> {
  const orm = await getOrm();
  const users = await orm.em.getConnection().execute<{ id: string }[]>(`select "id" from "user" order by "createdAt"`);
  const tally = { applied: 0, already: 0, pending: 0, refused: 0 };

  for (const { id } of users) {
    const result = await grantWelcome(id);
    if (result.applied) tally.applied += 1;
    else if (result.reason === "already_recorded") {
      tally.already += 1;
      // A grant opened earlier but never confirmed is sent again under its own key.
      if ((await retryPending(id)) > 0) tally.applied += 1;
    } else if (result.reason === "pending") tally.pending += 1;
    else tally.refused += 1;
  }

  console.log(
    `backfill-welcome — ${users.length} account(s): ${tally.applied} paid, ${tally.already} already granted, ` +
      `${tally.pending} pending (RevenueCat unreachable or unconfigured), ${tally.refused} refused`,
  );
  if (tally.pending > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error("backfill-welcome — failed:", error);
  process.exitCode = 1;
} finally {
  await closeOrm();
}
