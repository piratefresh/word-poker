import type { MikroORM } from "@mikro-orm/postgresql";
import { historyHand, isHistoryCursor, type HandRecord, type HistoryHand, type HistoryPage } from "@wordpoker/contracts";
import { getOrm } from "./orm";

interface HistoryRow {
  id: string;
  insertion_cursor: string;
  session_id: string;
  hand_no: number;
  mode: HandRecord["mode"];
  ranked: boolean;
  started_at: Date;
  ended_at: Date;
  dictionary_id: HandRecord["dictionaryId"];
  summary: HandRecord["summary"];
  config: HandRecord["config"];
  seats: HandRecord["seats"];
  actions: HandRecord["actions"];
  hero_id: string;
}

// Aggregate the bounded page in two lateral subqueries, avoiding per-hand detail requests.
const READ = `select h.*, mine.player_id as hero_id, seats.entries as seats, actions.entries as actions
  from game_hand h
  join hand_seat mine on mine.hand_id = h.id and mine.user_id = ?
  join lateral (select jsonb_agg(jsonb_build_object(
    'playerId', s.player_id, 'userId', s.user_id, 'name', s.name, 'initialStack', s.initial_stack
  ) order by s.seat) as entries from hand_seat s where s.hand_id = h.id) seats on true
  join lateral (select coalesce(jsonb_agg(jsonb_build_object(
    'sequence', a.sequence, 'atMs', floor(extract(epoch from a.at) * 1000),
    'source', a.source, 'action', a.action
  ) order by a.sequence), '[]'::jsonb) as entries from hand_action a where a.hand_id = h.id) actions on true`;

function view(row: HistoryRow): HistoryHand {
  // Only the display fields are consumed by the visibility projector.
  return historyHand({
    ...row, sessionId: row.session_id, handNo: row.hand_no,
    startedAtMs: new Date(row.started_at).getTime(), endedAtMs: new Date(row.ended_at).getTime(),
    dictionaryId: row.dictionary_id,
  }, row.id, row.hero_id);
}

export async function readHistoryHands(userId: string, cursor: string | null, options: { orm?: MikroORM; limit?: number } = {}): Promise<HistoryPage> {
  if (cursor !== null && !isHistoryCursor(cursor)) throw new Error("invalid history cursor");
  const after = cursor?.slice(3) ?? "0";
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const db = (options.orm ?? await getOrm()).em.getConnection();
  const rows = await db.execute<HistoryRow[]>(`${READ}
    where h.insertion_cursor > ? order by h.insertion_cursor limit ?`, [userId, after, limit + 1]);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    hands: page.map(view), hasMore: rows.length > limit,
    cursor: last ? `h1:${last.insertion_cursor}` : cursor,
  };
}

export async function readHistoryHand(userId: string, id: string, options: { orm?: MikroORM } = {}): Promise<HistoryHand | null> {
  if (!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return null;
  const db = (options.orm ?? await getOrm()).em.getConnection();
  const [row] = await db.execute<HistoryRow[]>(`${READ} where h.id = ?`, [userId, id]);
  return row ? view(row) : null;
}
