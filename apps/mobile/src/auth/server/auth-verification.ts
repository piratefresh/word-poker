/**
 * Better Auth's email-verification callbacks (STO-346).
 *
 * Server-only, like `auth.ts` that installs them: verifying an email is what pays the Wallet's
 * welcome grant, and `@wordpoker/economy` holds RevenueCat's secret key. Kept out of `auth.ts` so
 * the callbacks can be tested without a database pool or a Better Auth instance.
 *
 * Signing in never waits on verification; only the grant does.
 */

import { GUEST_HAND_BONUS, GUEST_HAND_BONUS_CAP, WELCOME_GRANT, isFriendCode } from "@wordpoker/contracts";
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
 * Pays the welcome grant once the email is verified. Never throws: a RevenueCat outage leaves the
 * wallet_event row `pending`, and the player's next `GET /api/wallet` sends it again.
 */
export async function afterEmailVerification(user: VerifiedUser): Promise<void> {
  try {
    // Hands a guest played before registering (moved over by `adoptGuestHistory`) earn a bonus. A
    // failed count costs the bonus, never the base grant.
    const hands = await countPlayedHands(user.id).catch((error: unknown) => {
      console.error(`[welcome-grant] ${user.id}: could not count guest hands:`, error);
      return 0;
    });
    const bonus = Math.min(hands * GUEST_HAND_BONUS, GUEST_HAND_BONUS_CAP);
    const result = await grantWelcome(user.id, {}, bonus);
    if (!result.applied && result.reason === "pending") {
      console.warn(`[welcome-grant] ${user.id}: RevenueCat unreachable; the grant is pending`);
    }
  } catch (error) {
    console.error(`[welcome-grant] ${user.id}: could not record the grant:`, error);
  }
  // An invited friend and their inviter are paid on the same verification (STO-582); never blocks it.
  // ponytail: a failed payment is not retried; re-run payReferral from GET /api/wallet if it shows up.
  await payReferral(user.id).catch((error: unknown) => console.error(`[referral] ${user.id}: could not pay:`, error));
}

/** The header the sign-up screen sends with the friend code its invite link carried (STO-582). */
export const REFERRAL_HEADER = "x-wordpoker-ref";

/**
 * Attributes a new account to the inviter whose code rode on the sign-up call. Never throws: a
 * bad or missing code just means no referral. Guests (the anonymous plugin's users) are skipped.
 */
export async function attributeReferral(user: { id: string; isAnonymous?: unknown }, headers: Headers | undefined): Promise<void> {
  const code = headers?.get(REFERRAL_HEADER);
  if (user.isAnonymous === true || !isFriendCode(code)) return;
  try {
    await recordReferral(user.id, code);
  } catch (error) {
    console.error(`[referral] ${user.id}: could not record the referral:`, error);
  }
}
