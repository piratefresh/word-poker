/**
 * avatars.ts — a player's avatar photo (STO-1050): the size the phone shrinks it to, what the
 * upload route accepts, and the route's answer.
 *
 * The phone crops and shrinks the photo (expo-image-manipulator, which also turns HEIC into JPEG),
 * so the server never decodes an image: it reads the file's header and refuses anything that is not
 * a small square JPEG or PNG. The route stores the bytes as they came.
 */

/** The side, in pixels, the phone shrinks every avatar to. */
export const AVATAR_SIDE = 256;
/** The largest side the server accepts, so a client on another size still gets through. */
export const AVATAR_MAX_SIDE = 512;
/** The largest file the server accepts. A 256px JPEG is a few dozen KB. */
export const AVATAR_MAX_BYTES = 512 * 1024;

export type AvatarImageType = "image/jpeg" | "image/png";

export type AvatarImage = { type: AvatarImageType; width: number; height: number };

/** `POST`/`DELETE /api/avatar`: the player's avatar URL after the change, `null` once removed. */
export type AvatarResponse = { image: string | null };

export function isAvatarResponse(value: unknown): value is AvatarResponse {
  if (typeof value !== "object" || value === null) return false;
  const image = (value as { image?: unknown }).image;

  return image === null || typeof image === "string";
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** The type and size a JPEG or PNG header declares, or `null` for anything else. Reads the header only. */
export function readAvatarImage(bytes: Uint8Array): AvatarImage | null {
  if (PNG_SIGNATURE.every((byte, i) => bytes[i] === byte)) {
    // The IHDR chunk always comes first: length (4), "IHDR" (4), width (4), height (4).
    if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    return { type: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
  }

  const at = (index: number) => bytes[index] ?? 0;
  if (at(0) !== 0xff || at(1) !== 0xd8) return null;
  // Walk the JPEG's marker segments up to the frame header (SOF), which holds the size.
  let i = 2;
  while (i + 3 < bytes.length) {
    if (at(i) !== 0xff) return null;
    const marker = at(i + 1);
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // end of image or scan data before any frame
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      if (i + 8 >= bytes.length) return null;

      return { type: "image/jpeg", height: (at(i + 5) << 8) | at(i + 6), width: (at(i + 7) << 8) | at(i + 8) };
    }
    i += 2 + ((at(i + 2) << 8) | at(i + 3));
  }

  return null;
}

/** Why the server refuses an upload, or `null` when it takes it. */
export function avatarRefusal(bytes: Uint8Array): string | null {
  if (bytes.length > AVATAR_MAX_BYTES) return "That photo is too large.";
  const image = readAvatarImage(bytes);
  if (!image) return "Use a JPG or PNG photo.";
  if (image.width !== image.height || image.width === 0 || image.width > AVATAR_MAX_SIDE) return "That photo isn’t a small square.";

  return null;
}
