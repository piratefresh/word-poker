/**
 * The Game Center proof verifier (STO-591) against a throwaway PKI: signature bytes, encodings,
 * freshness, key URL, certificate chain, key cache and the HTTPS key fetcher. No database; runs
 * through `pnpm --filter @wordpoker/mobile test:auth`.
 */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createPrivateKey, sign } from "node:crypto";
import { createServer } from "node:https";
import { describe, it } from "node:test";

import * as fx from "./game-center.fixtures.mjs";
import { gameCenterVerifier, httpsKeyFetcher, isReservedAddress, keyUrl, publicLookup } from "./game-center.ts";

const BUNDLE = "com.wordpoker.wordpoker";
const KEY_URL = "https://static.gc.apple.com/public-key/gc-prod-12.cer";
const NOW = Date.parse("2027-01-01T00:00:00Z");
const leafKey = createPrivateKey(fx.LEAF_KEY);
const trust = { intermediates: [fx.INTERMEDIATE], roots: [fx.ROOT] };

const signed = ({ teamPlayerID = "T:1234", bundleId = BUNDLE, timestamp = String(NOW - 1_000), salt = Buffer.from("salty-bytes"), key = leafKey, hash = "sha256" } = {}) => {
  const stamp = Buffer.alloc(8);
  stamp.writeBigUInt64BE(BigInt(timestamp));
  const payload = Buffer.concat([Buffer.from(teamPlayerID), Buffer.from(bundleId), stamp, salt]);
  return {
    teamPlayerID, bundleId: BUNDLE, publicKeyURL: KEY_URL, timestamp,
    saltBase64: salt.toString("base64"), signatureBase64: sign(hash, payload, key).toString("base64"),
  };
};

const setup = ({ cert = fx.LEAF, now = () => NOW, maxAgeSeconds } = {}) => {
  const fetched = [];
  const verify = gameCenterVerifier({
    bundleId: BUNDLE, now, trust,
    fetchKey: async (url) => {
      fetched.push(url.href);
      return { body: Buffer.from(cert), maxAgeSeconds };
    },
  });
  return { verify, fetched };
};

const refused = (code) => (error) => error?.code === code;

describe("gameCenterVerifier", () => {
  it("accepts a proof signed over id ‖ bundle ‖ UInt64BE(ms) ‖ salt", async () => {
    const { verify } = setup();
    const proof = signed();
    const identity = await verify(proof);
    assert.equal(identity.teamPlayerId, "T:1234");
    assert.match(identity.proofHash, /^[0-9a-f]{64}$/);
    assert.equal((await verify(proof)).proofHash, identity.proofHash, "same proof, same fingerprint");
    assert.notEqual((await verify(signed({ salt: Buffer.from("other-salt") }))).proofHash, identity.proofHash);
  });

  it("refuses any changed signed field", async () => {
    const { verify } = setup();
    const proof = signed();
    for (const changed of [
      { teamPlayerID: "T:9999" },
      { timestamp: String(NOW - 2_000) },
      { saltBase64: Buffer.from("salty-bytez").toString("base64") },
      { signatureBase64: Buffer.from(Buffer.from(proof.signatureBase64, "base64").map((b, i) => (i === 10 ? b ^ 1 : b))).toString("base64") },
    ]) await assert.rejects(verify({ ...proof, ...changed }), refused("INVALID_PROOF"), JSON.stringify(Object.keys(changed)));
    // Signed for another bundle, or submitted under one: both refused.
    await assert.rejects(verify(signed({ bundleId: "com.example.other" })), refused("INVALID_PROOF"));
    await assert.rejects(verify({ ...proof, bundleId: "com.example.other" }), refused("INVALID_PROOF"));
  });

  it("refuses the wrong hash, padding or key", async () => {
    const { verify } = setup();
    await assert.rejects(verify(signed({ hash: "sha1" })), refused("INVALID_PROOF"));
    await assert.rejects(verify(signed({ hash: "sha384" })), refused("INVALID_PROOF"));
    const proof = signed();
    const stamp = Buffer.alloc(8);
    stamp.writeBigUInt64BE(BigInt(proof.timestamp));
    const payload = Buffer.concat([Buffer.from(proof.teamPlayerID), Buffer.from(BUNDLE), stamp, Buffer.from("salty-bytes")]);
    const pss = sign("sha256", payload, { key: leafKey, padding: 6 /* RSA_PKCS1_PSS_PADDING */ }).toString("base64");
    await assert.rejects(verify({ ...proof, signatureBase64: pss }), refused("INVALID_PROOF"));
    const decimalStamp = sign("sha256", Buffer.concat([Buffer.from(proof.teamPlayerID), Buffer.from(BUNDLE), Buffer.from(proof.timestamp), Buffer.from("salty-bytes")]), leafKey);
    await assert.rejects(verify({ ...proof, signatureBase64: decimalStamp.toString("base64") }), refused("INVALID_PROOF"));
  });

  it("refuses malformed or oversized encodings before fetching a key", async () => {
    const { verify, fetched } = setup();
    const proof = signed();
    for (const changed of [
      { saltBase64: "" },
      { saltBase64: "c2FsdA" },
      { saltBase64: "c2Fs dA==" },
      { saltBase64: "c2Fsd-_=" },
      { saltBase64: Buffer.alloc(257).toString("base64") },
      { signatureBase64: Buffer.alloc(1025).toString("base64") },
      { teamPlayerID: "" },
      { teamPlayerID: "é".repeat(129) },
      { timestamp: "-1" },
      { timestamp: "1.5" },
      { timestamp: "18446744073709551616" },
      { timestamp: "123456789012345678901" },
    ]) await assert.rejects(verify({ ...proof, ...changed }), refused("INVALID_PROOF"), JSON.stringify(changed));
    assert.deepEqual(fetched, []);
  });

  it("keeps UInt64 exact and enforces 5 min / 60 s freshness", async () => {
    const { verify, fetched } = setup();
    await assert.rejects(verify(signed({ timestamp: "18446744073709551615" })), refused("PROOF_EXPIRED"));
    await assert.rejects(verify(signed({ timestamp: "0" })), refused("PROOF_EXPIRED"));
    await assert.rejects(verify(signed({ timestamp: String(NOW - 300_001) })), refused("PROOF_EXPIRED"));
    await assert.rejects(verify(signed({ timestamp: String(NOW + 60_001) })), refused("PROOF_EXPIRED"));
    assert.deepEqual(fetched, []);
    await verify(signed({ timestamp: String(NOW - 300_000) }));
    await verify(signed({ timestamp: String(NOW + 60_000) }));
  });

  it("accepts key URLs only on Apple's key host", () => {
    assert.ok(keyUrl(KEY_URL));
    assert.ok(keyUrl("https://static.gc.apple.com/public-key/gc-sb-2.cer"));
    for (const url of [
      "http://static.gc.apple.com/public-key/gc-prod-12.cer",
      "https://static.gc.apple.com.evil.test/public-key/gc-prod-12.cer",
      "https://evilstatic.gc.apple.com/public-key/gc-prod-12.cer",
      "https://gc.apple.com/public-key/gc-prod-12.cer",
      "https://STATIC.GC.APPLE.COM/public-key/gc-prod-12.cer",
      "https://static.gc.apple.com:8443/public-key/gc-prod-12.cer",
      "https://user:pw@static.gc.apple.com/public-key/gc-prod-12.cer",
      "https://static.gc.apple.com/public-key/gc-prod-12.cer?x=1",
      "https://static.gc.apple.com/public-key/gc-prod-12.cer#x",
      "https://static.gc.apple.com/public-key/../gc-prod-12.cer",
      "https://static.gc.apple.com/other/gc-prod-12.cer",
      "https://17.0.0.1/public-key/gc-prod-12.cer",
      "https://localhost/public-key/gc-prod-12.cer",
      "not a url",
    ]) assert.equal(keyUrl(url), null, url);
  });

  it("refuses keys that do not chain to the anchors as an Apple code-signing leaf", async () => {
    for (const cert of [fx.ROGUE_LEAF, fx.OTHER_LEAF, fx.TLS_LEAF, fx.INTERMEDIATE, fx.ROOT, "not a certificate"]) {
      await assert.rejects(setup({ cert }).verify(signed()), refused("INVALID_PROOF"));
    }
    // Before the leaf is valid, and after the chain expired.
    await assert.rejects(setup({ now: () => Date.parse("2026-01-01T00:00:00Z") }).verify(signed({ timestamp: String(Date.parse("2026-01-01T00:00:00Z")) })), refused("INVALID_PROOF"));
    const late = Date.parse("2044-01-01T00:00:00Z");
    await assert.rejects(setup({ now: () => late }).verify(signed({ timestamp: String(late) })), refused("INVALID_PROOF"));
    // An anchor set without the intermediate.
    const bare = gameCenterVerifier({ bundleId: BUNDLE, now: () => NOW, trust: { intermediates: [], roots: [fx.ROOT] }, fetchKey: async () => ({ body: Buffer.from(fx.LEAF) }) });
    await assert.rejects(bare(signed()), refused("INVALID_PROOF"));
  });

  it("validates Apple's real gc-prod-12 key against the pinned DigiCert anchors", async () => {
    const at = Date.parse("2026-10-14T12:00:00Z");
    // The chain passes, so the refusal comes from our fixture key not having signed with Apple's.
    const fetched = [];
    const reached = gameCenterVerifier({
      bundleId: BUNDLE, now: () => at,
      fetchKey: async (url) => { fetched.push(url.href); return { body: Buffer.from(fx.APPLE_GC_PROD_12) }; },
    });
    await assert.rejects(reached(signed({ timestamp: String(at) })), refused("INVALID_PROOF"));
    await assert.rejects(reached(signed({ timestamp: String(at) })), refused("INVALID_PROOF"));
    assert.equal(fetched.length, 1, "a trusted key is cached; a refused chain never would be");
    const expired = Date.parse("2027-06-01T00:00:00Z");
    const afterExpiry = gameCenterVerifier({ bundleId: BUNDLE, now: () => expired, fetchKey: async () => ({ body: Buffer.from(fx.APPLE_GC_PROD_12) }) });
    await assert.rejects(afterExpiry(signed({ timestamp: String(expired) })), refused("INVALID_PROOF"));
  });

  it("caches validated keys within max-age, 24 h and the chain's expiry", async () => {
    let now = NOW;
    const { verify, fetched } = setup({ now: () => now });
    await verify(signed({ timestamp: String(now) }));
    await verify(signed({ timestamp: String(now) }));
    assert.equal(fetched.length, 1);
    now += 24 * 60 * 60_000 + 1;
    await verify(signed({ timestamp: String(now) }));
    assert.equal(fetched.length, 2, "24 h cap");

    const short = setup({ now: () => now, maxAgeSeconds: 60 });
    await short.verify(signed({ timestamp: String(now) }));
    now += 61_000;
    await short.verify(signed({ timestamp: String(now) }));
    assert.equal(short.fetched.length, 2, "upstream max-age");

    const uncached = setup({ now: () => now, maxAgeSeconds: 0 });
    await uncached.verify(signed({ timestamp: String(now) }));
    await uncached.verify(signed({ timestamp: String(now) }));
    assert.equal(uncached.fetched.length, 2, "no-store");
  });

  it("re-fetches a rotated key, and bounds the cache to 32 URLs", async () => {
    let cert = fx.LEAF;
    const fetched = [];
    const verify = gameCenterVerifier({ bundleId: BUNDLE, now: () => NOW, trust, fetchKey: async (url) => { fetched.push(url.pathname); return { body: Buffer.from(cert) }; } });
    for (let n = 0; n < 33; n += 1) await verify({ ...signed(), publicKeyURL: `https://static.gc.apple.com/public-key/k${n}.cer` });
    await verify({ ...signed(), publicKeyURL: "https://static.gc.apple.com/public-key/k0.cer" });
    assert.equal(fetched.filter((path) => path.endsWith("/k0.cer")).length, 2, "oldest entry evicted");
    await verify({ ...signed(), publicKeyURL: "https://static.gc.apple.com/public-key/k32.cer" });
    assert.equal(fetched.filter((path) => path.endsWith("/k32.cer")).length, 1, "newest entry kept");
    cert = fx.ROGUE_LEAF;
    await assert.rejects(verify({ ...signed(), publicKeyURL: "https://static.gc.apple.com/public-key/k99.cer" }), refused("INVALID_PROOF"));
  });

  it("passes key host failures through as provider errors", async () => {
    const down = gameCenterVerifier({ bundleId: BUNDLE, now: () => NOW, trust, fetchKey: async () => { throw new Error("ETIMEDOUT"); } });
    await assert.rejects(down(signed()), (error) => error.message === "ETIMEDOUT" && error.code === undefined);
  });
});

describe("key host fetching", () => {
  it("treats loopback, private, link-local and mapped addresses as reserved", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "::1", "::", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "nonsense"]) {
      assert.equal(isReservedAddress(address), true, address);
    }
    for (const address of ["17.253.144.10", "23.215.0.1", "2a01:b740::1"]) assert.equal(isReservedAddress(address), false, address);
  });

  it("refuses a host that resolves to loopback", async () => {
    const result = await new Promise((resolve) => publicLookup("localhost", { all: true }, (error) => resolve(error)));
    assert.equal(result?.code, "ERESERVED");
  });

  // A local HTTPS server answering as static.gc.apple.com, trusted via the test root.
  const serve = async (handler) => {
    const server = createServer({ key: fx.TLS_KEY, cert: fx.TLS_LEAF + fx.INTERMEDIATE }, handler);
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const fetchKey = httpsKeyFetcher({
      timeoutMs: 300, ca: fx.ROOT, port: server.address().port,
      lookup: (_host, options, callback) => (options.all ? callback(null, [{ address: "127.0.0.1", family: 4 }]) : callback(null, "127.0.0.1", 4)),
    });
    return { fetchKey, port: server.address().port, close: () => new Promise((resolve) => server.close(resolve)) };
  };
  const url = new URL(KEY_URL);

  it("fetches a key and reads max-age", async () => {
    const { fetchKey, close } = await serve((_req, res) => res.writeHead(200, { "cache-control": "public, max-age=3600" }).end(fx.LEAF));
    try {
      const { body, maxAgeSeconds } = await fetchKey(url);
      assert.equal(body.toString(), fx.LEAF);
      assert.equal(maxAgeSeconds, 3600);
    } finally {
      await close();
    }
  });

  it("does not follow redirects, and reads a 404 as a bad proof", async () => {
    const { fetchKey, close } = await serve((req, res) =>
      req.url.endsWith("missing.cer") ? res.writeHead(404).end() : res.writeHead(302, { location: "https://static.gc.apple.com/public-key/gc-prod-11.cer" }).end());
    try {
      await assert.rejects(fetchKey(url), /answered 302/);
      await assert.rejects(fetchKey(new URL("https://static.gc.apple.com/public-key/missing.cer")), refused("INVALID_PROOF"));
    } finally {
      await close();
    }
  });

  it("stops at 64 KiB, declared or streamed", async () => {
    const big = Buffer.alloc(64 * 1024 + 1, 65);
    const { fetchKey, close } = await serve((req, res) => {
      if (req.url.endsWith("declared.cer")) return res.writeHead(200, { "content-length": big.length }).end(big);
      res.writeHead(200);
      res.write(big.subarray(0, 40_000));
      res.end(big.subarray(40_000));
    });
    try {
      await assert.rejects(fetchKey(new URL("https://static.gc.apple.com/public-key/declared.cer")), /too large/);
      await assert.rejects(fetchKey(url), /too large/);
    } finally {
      await close();
    }
  });

  it("times out a slow key host", async () => {
    const { fetchKey, close } = await serve((_req, res) => setTimeout(() => res.writeHead(200).end(fx.LEAF), 1_000));
    try {
      await assert.rejects(fetchKey(url), (error) => error.name === "TimeoutError" || error.name === "AbortError");
    } finally {
      await close();
    }
  });

  it("refuses a key host whose TLS certificate the system does not trust", async () => {
    const { port, close } = await serve((_req, res) => res.writeHead(200).end(fx.LEAF));
    try {
      const untrusting = httpsKeyFetcher({ timeoutMs: 300, port, lookup: (_h, options, cb) => (options.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4)) });
      await assert.rejects(untrusting(url), (error) => /CERT/.test(error.code));
    } finally {
      await close();
    }
  });
});
