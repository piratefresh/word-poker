/**
 * The avatar upload's header check (STO-1050): the server reads type and size from the header only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AVATAR_MAX_BYTES, avatarRefusal, isAvatarResponse, readAvatarImage } from "../src/index";

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

/** SOI, an APP0 segment, then a baseline frame header. */
function jpeg(width: number, height: number, frame = 0xc0): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46,
    0xff, frame, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03,
  ]);
}

describe("readAvatarImage", () => {
  it("reads a PNG's size", () => {
    assert.deepEqual(readAvatarImage(png(256, 128)), { type: "image/png", width: 256, height: 128 });
  });

  it("reads a JPEG's size past the segments before its frame", () => {
    assert.deepEqual(readAvatarImage(jpeg(300, 256)), { type: "image/jpeg", width: 300, height: 256 });
    assert.deepEqual(readAvatarImage(jpeg(256, 256, 0xc2)), { type: "image/jpeg", width: 256, height: 256 });
  });

  it("refuses anything else", () => {
    assert.equal(readAvatarImage(new TextEncoder().encode("GIF89a........")), null);
    assert.equal(readAvatarImage(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2])), null);
    assert.equal(readAvatarImage(new Uint8Array()), null);
  });
});

describe("avatarRefusal", () => {
  it("takes a small square", () => {
    assert.equal(avatarRefusal(jpeg(256, 256)), null);
    assert.equal(avatarRefusal(png(512, 512)), null);
  });

  it("refuses a non-square, oversized or empty frame", () => {
    assert.equal(avatarRefusal(jpeg(256, 200)), "That photo isn’t a small square.");
    assert.equal(avatarRefusal(png(513, 513)), "That photo isn’t a small square.");
    assert.equal(avatarRefusal(png(0, 0)), "That photo isn’t a small square.");
  });

  it("refuses a non-image and a file over the limit", () => {
    assert.equal(avatarRefusal(new TextEncoder().encode("hello")), "Use a JPG or PNG photo.");
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set(jpeg(256, 256));
    assert.equal(avatarRefusal(big), "That photo is too large.");
  });
});

describe("isAvatarResponse", () => {
  it("accepts a URL or null", () => {
    assert.ok(isAvatarResponse({ image: "https://cdn.example/a.jpg" }));
    assert.ok(isAvatarResponse({ image: null }));
    assert.ok(!isAvatarResponse({}));
    assert.ok(!isAvatarResponse(null));
  });
});
