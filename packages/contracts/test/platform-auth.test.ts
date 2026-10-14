import assert from "node:assert/strict";
import { test } from "node:test";
import { isAccountEligible, isPlaceholderEmail, parseBeginRequest, parseGameCenterRequest, parsePlayGamesRequest } from "../src/index";

test("eligibility needs a permanent account with a verified email or primary identity", () => {
  assert.equal(isAccountEligible({ emailVerified: true }), true);
  assert.equal(isAccountEligible({ emailVerified: false, primaryIdentityVerified: true }), true);
  assert.equal(isAccountEligible({ emailVerified: false, primaryIdentityVerified: false }), false);
  assert.equal(isAccountEligible({ isAnonymous: true, emailVerified: true, primaryIdentityVerified: true }), false);
  assert.equal(isAccountEligible(null), false);
  assert.equal(isPlaceholderEmail("u1@game-center.placeholder.invalid"), true);
  assert.equal(isPlaceholderEmail("ada@example.com"), false);
});

const proof = { teamPlayerID: "T:1", bundleId: "com.wordpoker.wordpoker", publicKeyURL: "https://static.gc.apple.com/public-key/gc-prod-10.cer", signatureBase64: "c2ln", saltBase64: "c2FsdA==", timestamp: "18446744073709551615" };

test("platform-auth bodies are strict: unknown fields and wrong intents refuse", () => {
  assert.deepEqual(parseBeginRequest({ provider: "game-center", intent: "link" }), { provider: "game-center", intent: "link" });
  assert.equal(parseBeginRequest({ provider: "game-center", intent: "restore" }), null);
  assert.equal(parseBeginRequest({ provider: "game-center", intent: "sign-in", userId: "x" }), null);
  assert.equal(parseGameCenterRequest({ attemptToken: "t", proof })?.adoptGuestProgress, false);
  assert.equal(parseGameCenterRequest({ attemptToken: "t", proof, targetUserId: "x" }), null);
  assert.equal(parseGameCenterRequest({ attemptToken: "t", proof: { ...proof, timestamp: "1.5e12" } }), null);
  assert.equal(parseGameCenterRequest({ attemptToken: "t", proof: { ...proof, displayName: "Ada" } }), null);
  assert.deepEqual(parsePlayGamesRequest({ attemptToken: "t", serverAuthCode: "c", expectedVersion: 2 }), { attemptToken: "t", serverAuthCode: "c", expectedVersion: 2 });
  assert.equal(parsePlayGamesRequest({ attemptToken: "t", serverAuthCode: "c", playerId: "p" }), null);
  assert.equal(parsePlayGamesRequest({ attemptToken: "t", serverAuthCode: "x".repeat(4097) }), null);
  assert.equal(parsePlayGamesRequest({ attemptToken: "t", serverAuthCode: "c", expectedVersion: 0 }), null);
});
