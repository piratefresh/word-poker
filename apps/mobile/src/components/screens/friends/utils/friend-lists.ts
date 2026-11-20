import type { Friend, FriendsPage } from "@wordpoker/contracts";

export const FRIENDS_TABS = ["online", "all", "requests"] as const;
export type FriendsTab = (typeof FRIENDS_TABS)[number];

/** A list on the clipboard; `title` is set only where the paper prints a heading (the Requests tab). */
export interface FriendsSection {
  readonly kind: "friends" | "incoming" | "outgoing";
  readonly title?: string;
  readonly rows: readonly Friend[];
}

export const EMPTY_COPY: Record<FriendsTab, string> = {
  online: "Nobody online right now.",
  all: "No friends yet. Bring someone in.",
  requests: "No requests.",
};

// At a table sorts before the lobby, as in the design; offline goes last on All.
const ORDER = { "at-table": 0, online: 1, offline: 2 } as const;

export function isOnline(friend: Friend): boolean {
  return friend.status === "online" || friend.status === "at-table";
}

export function byPresence(friends: readonly Friend[]): Friend[] {
  return [...friends].sort((a, b) => ORDER[a.status ?? "offline"] - ORDER[b.status ?? "offline"]);
}

export function tabCounts(page: FriendsPage): Record<FriendsTab, number> {
  return { online: page.friends.filter(isOnline).length, all: page.friends.length, requests: page.incoming.length };
}

/** The tab a visit opens on: Online when anyone is there, otherwise All. */
export function defaultTab(page: FriendsPage): FriendsTab {
  return page.friends.some(isOnline) ? "online" : "all";
}

export function sectionsFor(page: FriendsPage, tab: FriendsTab): FriendsSection[] {
  const sections: FriendsSection[] = tab === "online" ? [{ kind: "friends", rows: byPresence(page.friends.filter(isOnline)) }]
    : tab === "all" ? [{ kind: "friends", rows: byPresence(page.friends) }]
    : [{ kind: "incoming", title: "Asked you", rows: page.incoming }, { kind: "outgoing", title: "You asked", rows: page.outgoing }];
  return sections.filter((section) => section.rows.length > 0);
}
