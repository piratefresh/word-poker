/**
 * Better Auth's email-verification callbacks (STO-346).
 *
 * Server-only, like `auth.ts` that installs them: verifying an email is what pays the Wallet's
 * welcome grant, and `@wordpoker/economy` holds RevenueCat's secret key. Kept out of `auth.ts` so
 * the callbacks can be tested without a database pool or a Better Auth instance.
 *
 * Signing in never waits on verification; only the grant does.
 */

import {
  GUEST_HAND_BONUS,
  GUEST_HAND_BONUS_CAP,
  WELCOME_GRANT,
  isAccountEligible,
  isFriendCode,
  type EligibilityUser,
} from "@wordpoker/contracts";
import { countPlayedHands, recordReferral } from "@wordpoker/db";
import { grantWelcome, payReferral } from "@wordpoker/economy";

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
 * The once-only rewards an eligible account earns (STO-346, STO-593): the welcome grant with its
 * guest-hand bonus, then the referral pay. Email verification, a Game Center sign-in or link, and
 * `GET /api/wallet` (the retry) all call it; each lands on the same once-only wallet_event rows,
 * so it can run any number of times. Never throws: a RevenueCat outage leaves the row `pending`.
 *
 * A guest-hand count that fails records nothing, so the bonus is never finalized smaller than the
 * hands that moved; the next wallet read tries again.
 */
export async function grantEligibleRewards(user: { readonly id: string } & EligibilityUser): Promise<void> {
  if (!isAccountEligible(user)) return;
  let hands: number;
  try {
    // Hands a guest played before registering (moved over by `adoptGuestHistory`) earn a bonus.
    hands = await countPlayedHands(user.id);
  } catch (error) {
    console.error(`[welcome-grant] ${user.id}: could not count guest hands; left for the next wallet read:`, error);
    return;
  }
  try {
    const bonus = Math.min(hands * GUEST_HAND_BONUS, GUEST_HAND_BONUS_CAP);
    const result = await grantWelcome(user.id, {}, bonus);
    if (!result.applied && result.reason === "pending") {
      console.warn(`[welcome-grant] ${user.id}: RevenueCat unreachable; the grant is pending`);
    }
  } catch (error) {
    console.error(`[welcome-grant] ${user.id}: could not record the grant:`, error);
  }
  // An invited friend and their inviter are paid with the welcome grant (STO-582); never blocks it.
  // ponytail: a failed payment is retried only while the welcome row is missing; retry payReferral on every wallet read if it shows up.
  await payReferral(user.id).catch((error: unknown) => console.error(`[referral] ${user.id}: could not pay:`, error));
}

/** Better Auth calls this once the email is verified, which is what makes the account eligible. */
export async function afterEmailVerification(user: VerifiedUser): Promise<void> {
  await grantEligibleRewards({ ...user, emailVerified: true });
}

/** The header the sign-up screen sends with the friend code its invite link carried (STO-582). */
export const REFERRAL_HEADER = "x-wordpoker-ref";

/**
 * Attributes a new account to the inviter whose code rode on the sign-up call, or in the OAuth
 * state (`oauthReferral`) when it came back from Google or Apple. Never throws: a bad or missing
 * code just means no referral. Guests (the anonymous plugin's users) are skipped.
 */
export async function attributeReferral(user: { id: string; isAnonymous?: unknown }, headers: Headers | undefined, oauthReferral?: unknown): Promise<void> {
  const code = headers?.get(REFERRAL_HEADER) ?? oauthReferral;
  if (user.isAnonymous === true || !isFriendCode(code)) return;
  try {
    await recordReferral(user.id, code);
  } catch (error) {
    console.error(`[referral] ${user.id}: could not record the referral:`, error);
  }
}
