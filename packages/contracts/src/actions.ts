/**
 * What the offline game can be told to do: deal a fresh hand, or hand the table to the
 * next round. Deliberately narrow — betting is out of scope for offline play, so a
 * betting action is absent from the union rather than accepted and ignored.
 */
export type OfflineAction = { type: "deal" } | { type: "advance" };
