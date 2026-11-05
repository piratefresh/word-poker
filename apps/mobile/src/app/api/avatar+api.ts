/**
 * avatar+api.ts — the signed-in player's avatar photo (STO-1050).
 *
 * `POST` takes one image as the request body, already cropped and shrunk on the phone
 * (`lib/avatar/avatar-client.ts`). The server reads the header only and refuses anything that is
 * not a small square JPEG or PNG; it then stores the bytes in R2 under a new key, points the user's
 * `image` at it and deletes the old one. `DELETE` clears `image` and the bucket. `image` is written
 * through Better Auth's internal adapter, never `updateUser`, which refuses it from clients
 * (`auth.ts`), so `image` can only ever point into the bucket or at a sign-in provider's photo.
 * Guests have no avatar: the Account sheet only offers one to accounts.
 */

import { AVATAR_MAX_BYTES, avatarRefusal, readAvatarImage, type AvatarResponse } from "@wordpoker/contracts";

import { auth } from "@/auth/server/auth";
import { avatarStore } from "@/auth/server/avatar-store";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The account behind the request, or the response that refuses it. */
async function account(request: Request): Promise<{ userId: string } | Response> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return json({ error: "Sign in to set a photo." }, 401);
  if (session.user.isAnonymous) return json({ error: "Create an account to set a photo." }, 403);

  return { userId: session.user.id };
}

async function setImage(userId: string, image: string | null): Promise<void> {
  const context = await auth.$context;
  await context.internalAdapter.updateUser(userId, { image });
}

const UNAVAILABLE = { error: "Photos aren’t available right now." };

/** `200` the new avatar URL, `400`/`413`/`415` a refused file, `401` signed out, `403` a guest. */
export async function POST(request: Request): Promise<Response> {
  const who = await account(request);
  if (who instanceof Response) return who;
  const store = avatarStore();
  if (!store) return json(UNAVAILABLE, 503);

  // The body is the image itself. Anything declared past the limit is refused unread.
  if (Number(request.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES) return json({ error: "That photo is too large." }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return json({ error: "Choose a photo to upload." }, 400);
  const refusal = avatarRefusal(bytes);
  if (refusal) return json({ error: refusal }, bytes.length > AVATAR_MAX_BYTES ? 413 : 415);
  const type = readAvatarImage(bytes)!.type;

  const { userId } = who;
  let saved: { key: string; url: string };
  try {
    saved = await store.put(userId, bytes, type);
  } catch (error) {
    console.error(`[avatar] ${userId}: could not save the photo:`, error);
    return json({ error: "The photo could not be saved." }, 502);
  }

  try {
    await setImage(userId, saved.url);
  } catch (error) {
    // The account still shows its old photo; the orphaned new one is cleared by the next change.
    console.error(`[avatar] ${userId}: could not point the account at the photo:`, error);
    return json({ error: "The photo could not be saved." }, 502);
  }

  // The new photo is live; an old one left behind is cleared by the next change.
  await store.deleteAll(userId, saved.key).catch((error) => console.error(`[avatar] ${userId}: could not delete the old photo:`, error));

  return json({ image: saved.url } satisfies AvatarResponse, 200);
}

/** `200` once the avatar is gone, `401` signed out, `403` a guest. */
export async function DELETE(request: Request): Promise<Response> {
  const who = await account(request);
  if (who instanceof Response) return who;
  const store = avatarStore();
  if (!store) return json(UNAVAILABLE, 503);

  const { userId } = who;
  try {
    await setImage(userId, null);
  } catch (error) {
    console.error(`[avatar] ${userId}: could not clear the photo:`, error);
    return json({ error: "The photo could not be removed." }, 502);
  }
  await store.deleteAll(userId).catch((error) => console.error(`[avatar] ${userId}: could not delete the photo:`, error));

  return json({ image: null } satisfies AvatarResponse, 200);
}
