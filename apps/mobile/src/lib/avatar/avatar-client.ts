/**
 * avatar-client.ts — sets and removes the player's avatar photo (STO-1050).
 *
 * The phone centre-crops the picked photo to a square and shrinks it to `AVATAR_SIDE` as a JPEG
 * (expo-image-manipulator, which also reads HEIC), so the server only checks and stores it. Both
 * calls refresh the session, so `session.user.image` follows the change.
 */

import { AVATAR_SIDE, isAvatarResponse } from "@wordpoker/contracts";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";

import { authClient } from "@/auth/client/auth-client";
import { apiBaseURL } from "@/lib/network/api-base-url";
import { sessionInit } from "@/lib/wallet/wallet-client";

/** The photo the player picks from their library, or `null` when they back out. No crop screen: `shrinkAvatar` centre-crops it. */
export async function pickAvatarPhoto(): Promise<string | null> {
  const result = await launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });

  return result.canceled ? null : (result.assets[0]?.uri ?? null);
}

/** The square, shrunk JPEG the server takes, from any photo the picker returns, as bytes. */
export async function shrinkAvatar(uri: string): Promise<Uint8Array> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(original.width, original.height);
  const square = await ImageManipulator.manipulate(original)
    .crop({ originX: Math.floor((original.width - side) / 2), originY: Math.floor((original.height - side) / 2), width: side, height: side })
    .resize({ width: AVATAR_SIDE, height: AVATAR_SIDE })
    .renderAsync();
  const { base64 } = await square.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!base64) throw new Error("The photo could not be read.");

  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function send(method: "POST" | "DELETE", body?: Uint8Array): Promise<string | null> {
  const init = await sessionInit();
  const headers = { ...(init.headers as Record<string, string> | undefined), ...(body ? { "content-type": "image/jpeg" } : {}) };
  const response = await fetch(`${apiBaseURL}/api/avatar`, { ...init, method, headers, body: body as BodyInit | undefined });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: unknown } | null)?.error;
    throw new Error(typeof error === "string" ? error : `The photo could not be saved (HTTP ${response.status}).`);
  }
  if (!isAvatarResponse(payload)) throw new Error("The server sent an answer it could not read.");
  authClient.$store.notify("$sessionSignal");

  return payload.image;
}

/** Shrinks the picked photo, uploads it as the request body and returns its public URL. */
export async function uploadAvatar(pickedUri: string): Promise<string | null> {
  return send("POST", await shrinkAvatar(pickedUri));
}

/** Removes the photo; the player falls back to their initial. */
export async function removeAvatar(): Promise<void> {
  await send("DELETE");
}
