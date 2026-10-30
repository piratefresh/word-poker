/**
 * Sets each wallet persona in `scripts/test-personas.json` to its `coins` figure, so the lobby's
 * broke, short and rich states can be tried from a real account. Run `scripts/seed-test-user.mjs`
 * first (it makes the accounts); `pnpm seed:test-users` runs both.
 *
 * The change goes through `applyWalletChange` as an `adjustment` of (target − balance), so it lands
 * in wallet_event like any other change. Rerunning puts a persona back to its figure after a test
 * has spent or won coins.
 */
import { readFileSync } from "node:fs";
import { closeOrm, getOrm } from "@wordpoker/db";
import { applyWalletChange, getCoinBalance } from "@wordpoker/economy";

interface Persona {
  readonly email: string;
  readonly coins: number | null;
}

const personas = (JSON.parse(readFileSync(new URL("../../../scripts/test-personas.json", import.meta.url), "utf8")) as Persona[])
  .filter((persona): persona is Persona & { coins: number } => persona.coins !== null);

try {
  const db = (await getOrm()).em.getConnection();
  for (const { email, coins } of personas) {
    const [user] = await db.execute<{ id: string }[]>(`select id from "user" where email = ?`, [email]);
    if (user === undefined) throw new Error(`${email} is missing; run scripts/seed-test-user.mjs first`);

    const balance = await getCoinBalance(user.id);
    if (balance === coins) {
      console.log(`${email}: ${coins} coins (unchanged)`);
      continue;
    }
    const result = await applyWalletChange(user.id, "adjustment", coins - balance);
    if (!result.applied) throw new Error(`${email}: adjustment not applied (${result.reason})`);
    console.log(`${email}: ${balance} → ${result.balance} coins`);
  }
} finally {
  await closeOrm();
}
