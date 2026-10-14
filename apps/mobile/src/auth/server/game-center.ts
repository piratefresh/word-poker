/**
 * game-center.ts — checks a GameKit identity-verification proof (STO-591). Server-only; installed as
 * `verifiers.gameCenter` of the platform-auth plugin when GAME_CENTER_BUNDLE_ID is set.
 *
 * Apple signs  UTF8(teamPlayerID) ‖ UTF8(bundle ID) ‖ UInt64BE(timestamp) ‖ salt  (RSASSA-PKCS1-v1_5,
 * SHA-256) with the key behind `publicKeyURL`. Everything cheap is checked before any network I/O;
 * the URL must be a key on Apple's key host, and the certificate there must chain to the pinned
 * anchors below. Freshness (at most 5 min old, 60 s ahead) is Word Poker policy, not Apple's; single
 * use is the plugin's job, keyed by the `proofHash` returned here.
 */

import { X509Certificate, constants, createHash, verify, type KeyObject } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

import type { GameCenterProof } from "@wordpoker/contracts";

import { PlatformAuthError, type VerifiedGameCenter } from "./platform-auth";

const KEY_HOST = "static.gc.apple.com";
const MAX_AGE_MS = 5n * 60_000n;
const MAX_AHEAD_MS = 60_000n;
const UINT64_MAX = 2n ** 64n - 1n;
const CODE_SIGNING = "1.3.6.1.5.5.7.3.3";
const CACHE_MAX = 32;
const CACHE_TTL_MS = 24 * 60 * 60_000;
const KEY_MAX_BYTES = 64 * 1024;

/**
 * Game Center keys (gc-prod-6 … gc-prod-12, checked 2026-10-14) are DigiCert code-signing
 * certificates issued to Apple Inc., not certificates from Apple's own CA. Pinned here: DigiCert
 * Trusted G4 Code Signing RSA4096 SHA384 2021 CA1 (SHA-256 46:01:1E:DE…AC:6B, to 2036) and DigiCert
 * Trusted Root G4 (SHA-256 55:2F:7B:DC…89:88, to 2038), both from cacerts.digicert.com. If Apple
 * moves to another issuer, sign-ins fail as INVALID_PROOF until that issuer is added.
 */
const DIGICERT_G4_CODE_SIGNING_CA = `-----BEGIN CERTIFICATE-----
MIIGsDCCBJigAwIBAgIQCK1AsmDSnEyfXs2pvZOu2TANBgkqhkiG9w0BAQwFADBi
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSEwHwYDVQQDExhEaWdpQ2VydCBUcnVzdGVkIFJvb3Qg
RzQwHhcNMjEwNDI5MDAwMDAwWhcNMzYwNDI4MjM1OTU5WjBpMQswCQYDVQQGEwJV
UzEXMBUGA1UEChMORGlnaUNlcnQsIEluYy4xQTA/BgNVBAMTOERpZ2lDZXJ0IFRy
dXN0ZWQgRzQgQ29kZSBTaWduaW5nIFJTQTQwOTYgU0hBMzg0IDIwMjEgQ0ExMIIC
IjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA1bQvQtAorXi3XdU5WRuxiEL1
M4zrPYGXcMW7xIUmMJ+kjmjYXPXrNCQH4UtP03hD9BfXHtr50tVnGlJPDqFX/IiZ
wZHMgQM+TXAkZLON4gh9NH1MgFcSa0OamfLFOx/y78tHWhOmTLMBICXzENOLsvsI
8IrgnQnAZaf6mIBJNYc9URnokCF4RS6hnyzhGMIazMXuk0lwQjKP+8bqHPNlaJGi
TUyCEUhSaN4QvRRXXegYE2XFf7JPhSxIpFaENdb5LpyqABXRN/4aBpTCfMjqGzLm
ysL0p6MDDnSlrzm2q2AS4+jWufcx4dyt5Big2MEjR0ezoQ9uo6ttmAaDG7dqZy3S
vUQakhCBj7A7CdfHmzJawv9qYFSLScGT7eG0XOBv6yb5jNWy+TgQ5urOkfW+0/tv
k2E0XLyTRSiDNipmKF+wc86LJiUGsoPUXPYVGUztYuBeM/Lo6OwKp7ADK5GyNnm+
960IHnWmZcy740hQ83eRGv7bUKJGyGFYmPV8AhY8gyitOYbs1LcNU9D4R+Z1MI3s
MJN2FKZbS110YU0/EpF23r9Yy3IQKUHw1cVtJnZoEUETWJrcJisB9IlNWdt4z4FK
PkBHX8mBUHOFECMhWWCKZFTBzCEa6DgZfGYczXg4RTCZT/9jT0y7qg0IU0F8WD1H
s/q27IwyCQLMbDwMVhECAwEAAaOCAVkwggFVMBIGA1UdEwEB/wQIMAYBAf8CAQAw
HQYDVR0OBBYEFGg34Ou2O/hfEYb7/mF7CIhl9E5CMB8GA1UdIwQYMBaAFOzX44LS
cV1kTN8uZz/nupiuHA9PMA4GA1UdDwEB/wQEAwIBhjATBgNVHSUEDDAKBggrBgEF
BQcDAzB3BggrBgEFBQcBAQRrMGkwJAYIKwYBBQUHMAGGGGh0dHA6Ly9vY3NwLmRp
Z2ljZXJ0LmNvbTBBBggrBgEFBQcwAoY1aHR0cDovL2NhY2VydHMuZGlnaWNlcnQu
Y29tL0RpZ2lDZXJ0VHJ1c3RlZFJvb3RHNC5jcnQwQwYDVR0fBDwwOjA4oDagNIYy
aHR0cDovL2NybDMuZGlnaWNlcnQuY29tL0RpZ2lDZXJ0VHJ1c3RlZFJvb3RHNC5j
cmwwHAYDVR0gBBUwEzAHBgVngQwBAzAIBgZngQwBBAEwDQYJKoZIhvcNAQEMBQAD
ggIBADojRD2NCHbuj7w6mdNW4AIapfhINPMstuZ0ZveUcrEAyq9sMCcTEp6QRJ9L
/Z6jfCbVN7w6XUhtldU/SfQnuxaBRVD9nL22heB2fjdxyyL3WqqQz/WTauPrINHV
UHmImoqKwba9oUgYftzYgBoRGRjNYZmBVvbJ43bnxOQbX0P4PpT/djk9ntSZz0rd
KOtfJqGVWEjVGv7XJz/9kNF2ht0csGBc8w2o7uCJob054ThO2m67Np375SFTWsPK
6Wrxoj7bQ7gzyE84FJKZ9d3OVG3ZXQIUH0AzfAPilbLCIXVzUstG2MQ0HKKlS43N
b3Y3LIU/Gs4m6Ri+kAewQ3+ViCCCcPDMyu/9KTVcH4k4Vfc3iosJocsL6TEa/y4Z
XDlx4b6cpwoG1iZnt5LmTl/eeqxJzy6kdJKt2zyknIYf48FWGysj/4+16oh7cGvm
oLr9Oj9FpsToFpFSi0HASIRLlk2rREDjjfAVKM7t8RhWByovEMQMCGQ8M4+uKIw8
y4+ICw2/O/TOHnuO77Xry7fwdxPm5yg/rBKupS8ibEH5glwVZsxsDsrFhsP2JjMM
B0ug0wcCampAMEhLNKhRILutG4UI4lkNbcoFUCvqShyepf2gpx8GdOfy1lKQ/a+F
SCH5Vzu0nAPthkX0tGFuv2jiJmCG6sivqf6UHedjGzqGVnhO
-----END CERTIFICATE-----`;

const DIGICERT_TRUSTED_ROOT_G4 = `-----BEGIN CERTIFICATE-----
MIIFkDCCA3igAwIBAgIQBZsbV56OITLiOQe9p3d1XDANBgkqhkiG9w0BAQwFADBi
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSEwHwYDVQQDExhEaWdpQ2VydCBUcnVzdGVkIFJvb3Qg
RzQwHhcNMTMwODAxMTIwMDAwWhcNMzgwMTE1MTIwMDAwWjBiMQswCQYDVQQGEwJV
UzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3d3cuZGlnaWNlcnQu
Y29tMSEwHwYDVQQDExhEaWdpQ2VydCBUcnVzdGVkIFJvb3QgRzQwggIiMA0GCSqG
SIb3DQEBAQUAA4ICDwAwggIKAoICAQC/5pBzaN675F1KPDAiMGkz7MKnJS7JIT3y
ithZwuEppz1Yq3aaza57G4QNxDAf8xukOBbrVsaXbR2rsnnyyhHS5F/WBTxSD1If
xp4VpX6+n6lXFllVcq9ok3DCsrp1mWpzMpTREEQQLt+C8weE5nQ7bXHiLQwb7iDV
ySAdYyktzuxeTsiT+CFhmzTrBcZe7FsavOvJz82sNEBfsXpm7nfISKhmV1efVFiO
DCu3T6cw2Vbuyntd463JT17lNecxy9qTXtyOj4DatpGYQJB5w3jHtrHEtWoYOAMQ
jdjUN6QuBX2I9YI+EJFwq1WCQTLX2wRzKm6RAXwhTNS8rhsDdV14Ztk6MUSaM0C/
CNdaSaTC5qmgZ92kJ7yhTzm1EVgX9yRcRo9k98FpiHaYdj1ZXUJ2h4mXaXpI8OCi
EhtmmnTK3kse5w5jrubU75KSOp493ADkRSWJtppEGSt+wJS00mFt6zPZxd9LBADM
fRyVw4/3IbKyEbe7f/LVjHAsQWCqsWMYRJUadmJ+9oCw++hkpjPRiQfhvbfmQ6QY
uKZ3AeEPlAwhHbJUKSWJbOUOUlFHdL4mrLZBdd56rF+NP8m800ERElvlEFDrMcXK
chYiCd98THU/Y+whX8QgUWtvsauGi0/C1kVfnSD8oR7FwI+isX4KJpn15GkvmB0t
9dmpsh3lGwIDAQABo0IwQDAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIB
hjAdBgNVHQ4EFgQU7NfjgtJxXWRM3y5nP+e6mK4cD08wDQYJKoZIhvcNAQEMBQAD
ggIBALth2X2pbL4XxJEbw6GiAI3jZGgPVs93rnD5/ZpKmbnJeFwMDF/k5hQpVgs2
SV1EY+CtnJYYZhsjDT156W1r1lT40jzBQ0CuHVD1UvyQO7uYmWlrx8GnqGikJ9yd
+SeuMIW59mdNOj6PWTkiU0TryF0Dyu1Qen1iIQqAyHNm0aAFYF/opbSnr6j3bTWc
fFqK1qI4mfN4i/RN0iAL3gTujJtHgXINwBQy7zBZLq7gcfJW5GqXb5JQbZaNaHqa
sjYUegbyJLkJEVDXCLG4iXqEI2FCKeWjzaIgQdfRnGTZ6iahixTXTBmyUEFxPT9N
cCOGDErcgdLMMpSEDQgJlxxPwO5rIHQw0uA5NBCFIRUBCOhVMt5xSdkoF1BN5r5N
0XWs0Mr7QbhDparTwwVETyw2m+L64kW4I1NsBm9nVX9GtUw/bihaeSbSpKhil9Ie
4u1Ki7wb/UdKDd9nZn6yW0HQO+T0O/QEY+nvwlQAUaCKKsnOeMzV6ocEGLPOr0mI
r/OSmbaz5mEP0oUA51Aa5BuVnRmhuZyxm7EAHu/QD09CbMkKvO5D+jpxpchNJqU1
/YldvIViHTLSoCtU7ZpXwdv6EM8Zt4tKG48BtieVU+i2iW1bvGjUI+iLUaJW+fCm
gKDWHrO8Dw9TdSmq6hN35N6MgSGtBxBHEa2HPQfRdbzP82Z+
-----END CERTIFICATE-----`;

export interface TrustAnchors {
  readonly intermediates: readonly string[];
  readonly roots: readonly string[];
}

export interface FetchedKey {
  readonly body: Buffer;
  /** From the response's Cache-Control; caching never outlives it. */
  readonly maxAgeSeconds?: number | undefined;
}

export interface GameCenterVerifierOptions {
  /** GAME_CENTER_BUNDLE_ID: the only bundle a proof may name, and the one the signed bytes use. */
  readonly bundleId: string;
  /** Tests inject these; production uses the wall clock, `httpsKeyFetcher()` and the pinned anchors. */
  readonly now?: () => number;
  readonly fetchKey?: (url: URL) => Promise<FetchedKey>;
  readonly trust?: TrustAnchors;
}

function refuse(): never {
  throw new PlatformAuthError("INVALID_PROOF");
}

/** Standard, padded base64 that round-trips exactly (Buffer.from alone skips stray characters). */
function canonicalBase64(value: string, minBytes: number, maxBytes: number): Buffer | null {
  const bytes = Buffer.from(value, "base64");
  return bytes.length >= minBytes && bytes.length <= maxBytes && bytes.toString("base64") === value ? bytes : null;
}

/** A key on Apple's key host, written exactly as parsed: no credentials, port, query or fragment. */
export function keyUrl(raw: string): URL | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  const plain = url.protocol === "https:" && url.hostname === KEY_HOST && !url.port && !url.username && !url.password;
  return plain && !url.search && !url.hash && url.href === raw && /^\/public-key\/[\w.-]+\.cer$/.test(url.pathname) ? url : null;
}

const RESERVED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) RESERVED.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 127], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) RESERVED.addSubnet(network, prefix, "ipv6");

/** Loopback, private, link-local, documentation, multicast or not an IP at all. */
export function isReservedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 0 || RESERVED.check(address, family === 4 ? "ipv4" : "ipv6");
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** dns.lookup that refuses the whole answer if any address is reserved, so DNS cannot aim us inward. */
export function publicLookup(hostname: string, options: LookupOptions, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    if (addresses.length === 0 || addresses.some((entry) => isReservedAddress(entry.address))) {
      return callback(Object.assign(new Error("key host resolved to a reserved address"), { code: "ERESERVED" }), "");
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

function maxAge(cacheControl: string | undefined): number | undefined {
  if (/\b(no-store|no-cache)\b/.test(cacheControl ?? "")) return 0;
  const match = /\bmax-age=(\d+)/.exec(cacheControl ?? "");
  return match ? Number(match[1]) : undefined;
}

export interface KeyFetcherOptions {
  readonly timeoutMs?: number;
  /** Tests only: a local server standing in for the key host. */
  readonly lookup?: typeof publicLookup;
  readonly ca?: string | undefined;
  readonly port?: number | undefined;
}

/**
 * GET over HTTPS: 5 s for the whole exchange, 64 KiB at most, redirects refused (only a 200 counts).
 * A 404 means the URL names no key, which is the proof's fault; other failures are Apple being down.
 */
export function httpsKeyFetcher({ timeoutMs = 5_000, lookup = publicLookup, ca, port }: KeyFetcherOptions = {}) {
  return (url: URL) =>
    new Promise<FetchedKey>((resolve, reject) => {
      const req = request(
        url,
        { lookup: lookup as never, signal: AbortSignal.timeout(timeoutMs), agent: false, ...(ca ? { ca } : {}), ...(port ? { port } : {}) },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return reject(res.statusCode === 404 ? new PlatformAuthError("INVALID_PROOF") : new Error(`key host answered ${res.statusCode}`));
          }
          if (Number(res.headers["content-length"] ?? 0) > KEY_MAX_BYTES) return req.destroy(new Error("key too large"));
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > KEY_MAX_BYTES) req.destroy(new Error("key too large"));
            else chunks.push(chunk);
          });
          res.on("end", () => resolve({ body: Buffer.concat(chunks), maxAgeSeconds: maxAge(res.headers["cache-control"]) }));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
}

const current = (cert: X509Certificate, at: number) => Date.parse(cert.validFrom) <= at && at <= Date.parse(cert.validTo);

/**
 * The Apple code-signing leaf → a CA intermediate → a root, each signature and validity checked at
 * `at`. Returns when the chain stops being valid, or null. No revocation check (OCSP/CRL).
 */
function chainValidUntil(leaf: X509Certificate, at: number, intermediates: X509Certificate[], roots: X509Certificate[]): number | null {
  if (leaf.ca || !leaf.keyUsage?.includes(CODE_SIGNING) || !leaf.subject.split("\n").includes("O=Apple Inc.") || !current(leaf, at)) return null;
  if (leaf.publicKey.asymmetricKeyType !== "rsa") return null;
  for (const issuer of intermediates) {
    if (!issuer.ca || !current(issuer, at) || !leaf.checkIssued(issuer) || !leaf.verify(issuer.publicKey)) continue;
    const root = roots.find((anchor) => current(anchor, at) && issuer.checkIssued(anchor) && issuer.verify(anchor.publicKey));
    if (root) return Math.min(...[leaf, issuer, root].map((cert) => Date.parse(cert.validTo)));
  }
  return null;
}

export function gameCenterVerifier({
  bundleId,
  now = Date.now,
  fetchKey = httpsKeyFetcher(),
  trust = { intermediates: [DIGICERT_G4_CODE_SIGNING_CA], roots: [DIGICERT_TRUSTED_ROOT_G4] },
}: GameCenterVerifierOptions): (proof: GameCenterProof) => Promise<VerifiedGameCenter> {
  const intermediates = trust.intermediates.map((pem) => new X509Certificate(pem));
  const roots = trust.roots.map((pem) => new X509Certificate(pem));
  const bundle = Buffer.from(bundleId, "utf8");
  // Validated keys only (never a player's proof), by URL, oldest evicted first.
  const keys = new Map<string, { key: KeyObject; until: number }>();

  const publicKey = async (url: URL): Promise<KeyObject> => {
    const cached = keys.get(url.href);
    if (cached && cached.until > now()) return cached.key;
    keys.delete(url.href);
    const fetched = await fetchKey(url);
    let leaf: X509Certificate;
    try {
      leaf = new X509Certificate(fetched.body);
    } catch {
      refuse();
    }
    const at = now();
    const chainUntil = chainValidUntil(leaf, at, intermediates, roots);
    if (chainUntil === null) refuse();
    const until = Math.min(chainUntil, at + Math.min(CACHE_TTL_MS, (fetched.maxAgeSeconds ?? Infinity) * 1000));
    if (keys.size >= CACHE_MAX) keys.delete(keys.keys().next().value!);
    keys.set(url.href, { key: leaf.publicKey, until });
    return leaf.publicKey;
  };

  return async (proof) => {
    const { teamPlayerID, publicKeyURL } = proof;
    if (!teamPlayerID || Buffer.byteLength(teamPlayerID, "utf8") > 256 || proof.bundleId !== bundleId) refuse();
    if (!/^\d{1,20}$/.test(proof.timestamp)) refuse();
    const timestamp = BigInt(proof.timestamp);
    const salt = canonicalBase64(proof.saltBase64, 1, 256);
    const signature = canonicalBase64(proof.signatureBase64, 1, 1024);
    const url = publicKeyURL.length <= 2048 ? keyUrl(publicKeyURL) : null;
    if (timestamp > UINT64_MAX || !salt || !signature || !url) refuse();

    // Apple's timestamp is milliseconds since the Unix epoch.
    const age = BigInt(Math.floor(now())) - timestamp;
    if (age > MAX_AGE_MS || age < -MAX_AHEAD_MS) throw new PlatformAuthError("PROOF_EXPIRED");

    const stamp = Buffer.alloc(8);
    stamp.writeBigUInt64BE(timestamp);
    const payload = Buffer.concat([Buffer.from(teamPlayerID, "utf8"), bundle, stamp, salt]);
    const key = await publicKey(url);
    if (!verify("sha256", payload, { key, padding: constants.RSA_PKCS1_PADDING }, signature)) refuse();

    return { teamPlayerId: teamPlayerID, proofHash: createHash("sha256").update(payload).update(signature).digest("hex") };
  };
}
