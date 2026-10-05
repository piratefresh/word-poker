/**
 * Better Auth's email-verification callbacks (STO-346).
 *
 * Server-only, like `auth.ts` that installs them: verifying an email is what pays the Wallet's
 * welcome grant, and `@wordpoker/economy` holds RevenueCat's secret key. Kept out of `auth.ts` so
 * the callbacks can be tested without a database pool or a Better Auth instance.
 *
 * Signing in never waits on verification; only the grant does.
 */

import { WELCOME_GRANT } from "@wordpoker/contracts";
import { grantWelcome } from "@wordpoker/economy";

import { sendEmail, verifyEmailEmail } from "./email";

interface VerifiedUser {
  readonly id: string;
  readonly email: string;
  readonly name?: string | null;
}

/** Mails the verification link; a mail that will not send is logged, never a failed sign-up. */
export async function sendVerificationEmail({ user, url }: { user: VerifiedUser; url: string }): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    // Like the reset flow: the link is visible without an inbox.
    console.log(`[verify-email] ${user.email}\n  button: ${url}`);
  }

  try {
    await sendEmail({
      to: user.email,
      ...verifyEmailEmail({ name: user.name ?? "", buttonUrl: url, coins: WELCOME_GRANT.toLocaleString("en-US") }),
    });
  } catch (error) {
    // The player can ask for another from the store; the account itself is already made.
    console.error(`[verify-email] could not mail ${user.email}:`, error);
  }
}

/**
 * Pays the welcome grant once the email is verified. Never throws: a RevenueCat outage leaves the
 * wallet_event row `pending`, and the player's next `GET /api/wallet` sends it again.
 */
export async function afterEmailVerification(user: VerifiedUser): Promise<void> {
  try {
    const result = await grantWelcome(user.id);
    if (!result.applied && result.reason === "pending") {
      console.warn(`[welcome-grant] ${user.id}: RevenueCat unreachable; the grant is pending`);
    }
  } catch (error) {
    console.error(`[welcome-grant] ${user.id}: could not record the grant:`, error);
  }
}
