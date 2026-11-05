/**
 * avatar-store.ts — players' avatar photos in a Cloudflare R2 bucket (STO-1050).
 *
 * R2 speaks the S3 API; `aws4fetch` signs plain `fetch` calls with the bucket's keys, which never
 * leave the server. Each upload gets a new key under `avatars/<userId>/`, served from the bucket's
 * public URL with a year-long immutable cache, so a new photo is a new URL. Clean-up deletes every
 * object under the player's prefix except the one to keep, so a delete that failed once is caught
 * by the next upload, removal or account deletion.
 *
 * Configured by `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (an R2 API token with
 * Object Read & Write on the bucket), `R2_AVATAR_BUCKET`, and `R2_PUBLIC_URL` (the bucket's public
 * `r2.dev` URL or custom domain). Without all five, photos are off: the route answers 503.
 */

import type { AvatarImageType } from "@wordpoker/contracts";
import { AwsClient } from "aws4fetch";

export type AvatarStore = {
  /** Saves the image under a new key and returns that key and its public URL. */
  put(userId: string, bytes: Uint8Array, type: AvatarImageType): Promise<{ key: string; url: string }>;
  /** Deletes every avatar the player has, except `keep`. */
  deleteAll(userId: string, keep?: string): Promise<void>;
};

const EXTENSION: Record<AvatarImageType, string> = { "image/jpeg": "jpg", "image/png": "png" };

/** The store, or `null` when this deployment has no R2 bucket configured. */
export function avatarStore(env: NodeJS.ProcessEnv = process.env): AvatarStore | null {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_AVATAR_BUCKET, R2_PUBLIC_URL } = env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_AVATAR_BUCKET || !R2_PUBLIC_URL) return null;

  const client = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
  const bucket = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_AVATAR_BUCKET}`;
  const publicUrl = R2_PUBLIC_URL.replace(/\/+$/, "");
  const prefix = (userId: string) => `avatars/${encodeURIComponent(userId)}/`;

  async function send(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await client.fetch(url, init);
    if (!response.ok && response.status !== 404) throw new Error(`R2 ${init.method ?? "GET"} answered ${response.status}`);

    return response;
  }

  return {
    async put(userId, bytes, type) {
      const key = `${prefix(userId)}${Date.now()}.${EXTENSION[type]}`;
      await send(`${bucket}/${key}`, {
        method: "PUT",
        body: bytes as unknown as BodyInit,
        headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
      });

      return { key, url: `${publicUrl}/${key}` };
    },

    async deleteAll(userId, keep) {
      const list = await send(`${bucket}?list-type=2&prefix=${encodeURIComponent(prefix(userId))}`);
      const keys = [...(await list.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]);
      await Promise.all(keys.filter((key) => key !== keep).map((key) => send(`${bucket}/${key}`, { method: "DELETE" })));
    },
  };
}
