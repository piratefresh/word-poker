/**
 * pending-destination.ts — where a link asked to land, held until the device can go there.
 *
 * The lobby is reachable from outside the app: `wordpoker://online` and `wordpoker://online?room=…`
 * — and the same screen on the web build's own URLs — name a table before anyone has signed in.
 * The guard can bounce a signed-out device to sign-in, so a link is remembered rather than
 * followed: the root layout captures the URL, and once a session exists it drains the destination
 * and replaces the route with it.
 *
 * A destination *is* the route it names, so nothing here talks to the router, and nothing here
 * knows how a table is joined — that is `room-session`'s business, one screen further on.
 */

import { isFriendCode } from "@wordpoker/contracts";

/** The screen that means the lobby, on the custom scheme and on a web URL alike. */
const ONLINE_SCREEN = "online";

/** §3's query parameter naming the table a link points at, when it points at one. */
const ROOM_PARAM = "room";

/**
 * Where a link asked to land, as the route the app should replace itself with. A link that names
 * a table carries it as a query parameter rather than a path segment: `/online/<id>` would read as
 * a nested route this app does not have, while `/online?room=<id>` stays the lobby with an arrival.
 */
export type Destination =
  | { readonly pathname: "/friends"; readonly params: { readonly add: string } }
  | { readonly pathname: "/online" }
  | { readonly pathname: "/online/[roomId]"; readonly params: { readonly roomId: string } };

/** A link's screen and the table it named, before either is known to be ours. */
interface Link {
  readonly screen: string;
  readonly room: string | null;
}

/**
 * A room id as a URL path carries it, or `null` for a segment that is not one. A table's id is a
 * plain token; a segment with a dot in it (`..`, `index.html`) is a path, not a table.
 */
function tableInPath(segment: string | undefined): string | null {
  if (segment === undefined || segment.length === 0 || segment.includes(".")) return null;
  return segment;
}

/**
 * The screen a link names and the table it puts in the path, before either is trusted.
 *
 * Each URL form has its own place for the two halves. The web build names the screen in the first
 * path segment and the table in the next (`https://host/online/<roomId>`); the custom scheme names
 * the screen where a web URL puts the host and the table in the first segment
 * (`wordpoker://online/<roomId>`). Either form may name no table at all (`…/online`), and the
 * `wordpoker:///online` shape some tools write is the web form with an empty authority.
 */
function screenAndRoom(target: string): Link {
  const [authority = "", ...segments] = target.split("/").filter((part) => part.length > 0);

  if (segments[0] === ONLINE_SCREEN) {
    return { screen: ONLINE_SCREEN, room: tableInPath(segments[1]) };
  }

  if (authority === ONLINE_SCREEN) {
    // A segment under the scheme's screen that is not a room id names nothing of ours — the link
    // is someone else's path, not this app's table.
    const named = tableInPath(segments[0]);
    if (segments.length === 0 || named !== null) return { screen: ONLINE_SCREEN, room: named };
  }

  // Some other link: the screen is whatever it named, and this app serves none of them.
  return { screen: segments[0] ?? authority, room: null };
}

/**
 * Read a URL as the screen it names and the `room` it carries.
 *
 * The table rides in the path (`…/online/<roomId>`) or, in the shareable form, in the query
 * (`…/online?room=<roomId>`) — a link that names neither still names the lobby.
 */
function parseLink(url: string): Link {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:/i, "");

  const end = withoutScheme.search(/[?#]/);
  const target = end === -1 ? withoutScheme : withoutScheme.slice(0, end);
  const query = end === -1 ? "" : withoutScheme.slice(end + 1);

  const { screen, room: fromPath } = screenAndRoom(target);

  let room: string | null = null;
  for (const pair of query.split("&")) {
    const [key = "", value = ""] = pair.split("=");
    if (key !== ROOM_PARAM) continue;

    let decoded = value;
    try {
      decoded = decodeURIComponent(value);
    } catch {
      // A malformed escape is read as it was written rather than thrown at.
    }

    room = decoded.trim().length > 0 ? decoded.trim() : null;
    break;
  }

  // The path form is the app's own (`/online/<roomId>`) and the query form is the shareable one;
  // a link that carries both names the same table either way, and the path is the one the app
  // itself writes.
  return { screen, room: fromPath ?? room };
}

/**
 * The destination a URL names, or `null` when it names nothing this app serves — another screen,
 * another origin, or no URL at all. A link to the lobby that names no table lands on the lobby.
 */
export function destinationFromURL(url: string | null | undefined): Destination | null {
  if (typeof url !== "string" || url.length === 0) return null;

  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const friendSegments = parsed.protocol === "wordpoker:" && parsed.hostname === "friend"
      ? ["friend", ...segments] : segments;
    if (friendSegments[0] === "friend") {
      const code = friendSegments[1];
      return friendSegments.length === 2 && isFriendCode(code)
        ? { pathname: "/friends", params: { add: code } } : null;
    }
  } catch {
    return null;
  }

  const { screen, room } = parseLink(url);
  if (screen !== ONLINE_SCREEN) return null;
  if (room === null) return { pathname: "/online" };
  return { pathname: "/online/[roomId]", params: { roomId: room } };
}

/** The link that arrived before the device could take it, if one did. */
let pending: Destination | null = null;

/** Hold a destination until the app can go there — a signed-out deep link waits for sign-in. */
export function rememberDestination(destination: Destination): void {
  pending = destination;
}

/** The held destination, if there is one, and no longer held: a link lands once. */
export function takeDestination(): Destination | null {
  const destination = pending;
  pending = null;
  return destination;
}
