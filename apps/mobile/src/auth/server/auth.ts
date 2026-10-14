import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { anonymous, bearer } from "better-auth/plugins";
import { adoptGuestHistory, inTransaction } from "@wordpoker/db";
import { config } from "dotenv";
import { Pool } from "pg";

import { RESET_PASSWORD_DEEP_LINK } from "@/constants/links";

import { afterEmailVerification, attributeReferral, grantEligibleRewards, sendVerificationEmail } from "./auth-verification";
import { passwordResetEmail, sendEmail } from "./email";
import { platformAuth } from "./platform-auth";

// `dotenv` leaves pre-existing variables untouched by default, so a shell that
// carries stale copies of these names would silently win over this app's `.env`.
// For the local API-route server the file is the source of truth.
const fileEnv = config({ override: true }).parsed ?? {};

// Better Auth ranks a configured base URL above the origin the request arrived
// on, and this app derives its origin from the request (localhost in a browser,
// the LAN address on a device, the deploy origin in production). A copy left in
// the shell — or inherited from an older setup — pins every mailed reset link to
// an origin no device can reach, so only a value this file sets is honoured.
for (const name of [
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_BETTER_AUTH_URL",
  "PUBLIC_BETTER_AUTH_URL",
  "NUXT_PUBLIC_BETTER_AUTH_URL",
  "NUXT_PUBLIC_AUTH_URL",
  "BASE_URL",
]) {
  if (!fileEnv[name]) {
    delete process.env[name];
  }
}

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export const authPool = new Pool({
  host: required("DATABASE_HOST"),
  port: Number(process.env.DATABASE_PORT ?? 5432),
  user: required("DATABASE_USER"),
  password: required("DATABASE_PASSWORD"),
  database: required("DATABASE_NAME"),
  ssl: true,
});

// Better Auth ranks a configured base URL over the request origin, but this
// server must answer on several: localhost (browser), the LAN address (device),
// and the deploy origin (production). A dynamic base URL keeps that per-request
// derivation while pinning it to an allowlist — and, unlike leaving `baseURL`
// unset, it does not warn that callbacks and redirects "may not work". An empty
// `allowedHosts` throws, so production without an explicit list falls back to
// the bare request-derived mode rather than crashing.
const authAllowedHosts = [
  ...(process.env.NODE_ENV === "development"
    ? ["localhost:8081", "127.0.0.1:8081", "192.168.*.*:*"]
    : []),
  ...(process.env.AUTH_ALLOWED_HOSTS?.split(",")
    .map((host) => host.trim())
    .filter(Boolean) ?? []),
];

export const auth = betterAuth({
  database: authPool,
  baseURL:
    authAllowedHosts.length > 0
      ? {
          allowedHosts: authAllowedHosts,
          protocol: process.env.NODE_ENV === "production" ? "https" : "http",
        }
      : undefined,
  trustedOrigins: [
    "wordpoker://*", // Deep links back into the native app after auth.
    ...(process.env.NODE_ENV === "development"
      ? [
          "exp://", // Trust any host of the exp:// scheme
          "exp://**", // Trust all Expo URLs (wildcard matching)
          "exp://192.168.*.*:*/**", // Trust 192.168.x.x IP range with any port and path
          "http://localhost:8081", // The dev server that serves this API route
          "http://127.0.0.1:8081",
          "http://192.168.*.*:*/**", // Same dev server, reached over the LAN
        ]
      : []),
  ],
  // Anonymous: a friend invited by link plays as a guest with a real session (STO-581), since
  // GameRoom.onAuth seats sessions, not devices. Guests never verify, so they never touch the Wallet.
  plugins: [
    expo(),
    bearer(),
    // Registering from a guest session: Better Auth deletes the guest, so its hands move first —
    // through the same once-only claim the Game Center flow uses (STO-593). A second account
    // racing for the same guest gets nothing moved; it still exists, just without the history.
    anonymous({
      onLinkAccount: async ({ anonymousUser, newUser }) => {
        const adopted = await inTransaction(authPool, (sql) => adoptGuestHistory(sql, anonymousUser.user.id, newUser.user.id));
        if (!adopted) console.warn("[guest-adoption] guest already adopted by another account");
      },
    }),
    // Game Center sign-in and Play Games restore (STO-590). No verifier is configured yet, so both
    // answer DISABLED; STO-591 and STO-592 supply them behind their own switches.
    platformAuth({
      pool: authPool,
      verifiers: {},
      onAccountReady: async (user, { created, headers }) => {
        if (created) await attributeReferral(user, headers);
        await grantEligibleRewards(user);
      },
    }),
  ],
  // Rate limits live in Postgres (`rateLimit`), so every API replica counts the same attempts.
  rateLimit: { storage: "database" },
  // The per-kind notification switches (STO-585) live on the account, so they follow the player
  // across devices; the client reads them from the session and writes them with `updateUser`.
  user: {
    additionalFields: {
      notifyTableInvite: { type: "boolean", defaultValue: true, required: false },
      notifyFriendRequest: { type: "boolean", defaultValue: true, required: false },
      notifyFriendOnline: { type: "boolean", defaultValue: false, required: false },
      // Set only by the server after it verified a Game Center or Google identity (STO-593); never
      // accepted from sign-up, updateUser or any custom body.
      primaryIdentityVerified: { type: "boolean", defaultValue: false, required: false, input: false },
    },
  },
  databaseHooks: {
    // The sign-up call carries the inviter's friend code in a header (STO-582).
    user: { create: { after: async (user, context) => attributeReferral(user, context?.headers ?? context?.request?.headers) } },
  },
  // Verifying pays the Wallet's welcome grant (STO-346); signing in does not wait on it.
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail,
    afterEmailVerification,
  },
  emailAndPassword: {
    enabled: true,
    // A reset is what a locked-out user reaches for when the account is
    // compromised, so it also drops every session the old password opened.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      const deepLink = `${RESET_PASSWORD_DEEP_LINK}?token=${token}`;

      if (process.env.NODE_ENV !== "production") {
        // Reset links are the one flow that cannot be exercised without an
        // inbox. Printing the exact link the mail carried turns "the button
        // does nothing" into a glance at the terminal — including the origin
        // Better Auth derived, which is what usually breaks it.
        console.log(`[reset-password] ${user.email}\n  button: ${url}\n  app:    ${deepLink}`);
      }

      await sendEmail({
        to: user.email,
        ...passwordResetEmail({
          name: user.name ?? "",
          // Mail clients only follow http(s), so the button points at Better
          // Auth's callback on the API origin; it verifies the token and
          // redirects into the app. `redirectTo` on the request decides where.
          buttonUrl: url,
          deepLink,
        }),
      });
    },
  },

  advanced: {
    database: {
      joins: true,
    },
  },
});
