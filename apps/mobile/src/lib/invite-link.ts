/**
 * invite-link.ts — the web URL a friend opens to sit at your table (STO-581).
 *
 * The link is the lobby's own shareable form (`/online?room=<id>`, see `pending-destination.ts`),
 * on the web build's origin so a friend without the app plays in the browser. A browser already
 * knows its origin; a device uses the dev server it was bundled from (`apiBaseURL`), and a
 * production build names the deployed web app in `EXPO_PUBLIC_WEB_URL`.
 */

import { Platform } from "react-native";

import { apiBaseURL } from "./api-base-url";

function webOrigin(): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
  return apiBaseURL;
}

export function inviteLinkFor(roomId: string): string {
  return `${webOrigin()}/online?room=${encodeURIComponent(roomId)}`;
}

export function friendLinkFor(code: string): string {
  return `${webOrigin()}/friend/${encodeURIComponent(code)}`;
}
