import assert from "node:assert/strict";
import { test } from "node:test";
import { isFriendCode, isFriendsPage, isBefriendResult, isGameMessagePayload } from "../src/index";

test("validates friend codes, private lists and online seat messages", () => {
  const code = "ABCD2345";
  assert.equal(isFriendCode(code), true);
  for (const invalid of ["ABCI2345", "ABCO2345", "ABC02345", "abcd2345", "ABCD2345\n", 123, null]) assert.equal(isFriendCode(invalid), false);
  const page = { code, friends: [{ userId: "a", name: "Ada" }], incoming: [], outgoing: [], referrals: 2 };
  assert.equal(isFriendsPage(page), true);
  assert.equal(isFriendsPage({ ...page, referrals: -1 }), false);
  assert.equal(isFriendsPage({ ...page, referrals: undefined }), false);
  assert.equal(isFriendsPage({ ...page, friends: [{ userId: "", name: "Ada" }] }), false);
  assert.equal(isFriendsPage({ ...page, incoming: Array(10001).fill(page.friends[0]) }), false);
  assert.equal(isGameMessagePayload("befriend", { playerId: "seat" }), true);
  assert.equal(isGameMessagePayload("befriend", { userId: "account" }), false);
  assert.equal(isBefriendResult({ playerId: "seat", message: "Friend request sent" }), true);
  assert.equal(isBefriendResult({ playerId: "seat", message: null }), false);
});
