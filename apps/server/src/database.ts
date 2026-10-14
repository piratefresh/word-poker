import { getOrm } from "@wordpoker/db";
import type { MikroORM } from "@mikro-orm/postgresql";

/** The online server opts into database features independently of the auth API. */
export async function serverOrm(): Promise<MikroORM | null> {
  const url = process.env.WORDPOKER_DATABASE_URL;
  return url ? getOrm(url) : null;
}
