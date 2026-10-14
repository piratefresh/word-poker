/**
 * Transactional email, sent through the Resend HTTP API.
 *
 * Server-only: this module reads `RESEND_API_KEY`, so it is only safe to import
 * from server code (the Better Auth API route). Expo only inlines `EXPO_PUBLIC_*`
 * into the client bundle; every other name stays in the server process.
 */

import { isPlaceholderEmail } from "@wordpoker/contracts";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Default sender, on the domain verified in Resend. (`onboarding@resend.dev`
 * only delivers to the account owner's own address.) Override with
 * `RESEND_FROM_EMAIL`.
 */
const DEFAULT_FROM = "Word Poker <hello@email.wordpoker.app>";

/** One hour, matching `emailAndPassword.resetPasswordTokenExpiresIn`. */
const LINK_LIFETIME = "one hour";

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** POSTs one message; throws with Resend's own diagnostic when it is rejected. */
export async function sendEmail({ to, subject, html, text }: Email): Promise<void> {
  // Game Center accounts and guests carry internal `.invalid` addresses: refused here, not just hidden.
  if (isPlaceholderEmail(to)) throw new Error("Refusing to mail a placeholder address");

  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("Missing environment variable: RESEND_API_KEY");
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
      to,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend rejected ${to} (${response.status}): ${await response.text()}`);
  }
}

const brand = {
  felt: "#051410",
  card: "#060d06",
  border: "rgba(212,175,55,0.24)",
  gold: "#d4af37",
  onGold: "#1a1208",
  cream: "#f4e4c1",
  dim: "rgba(232,220,192,0.6)",
  faint: "rgba(232,220,192,0.35)",
} as const;

const sans = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const serif = "Georgia,'Times New Roman',serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The reset mail: same felt-and-gold voice as the app, table-based for mail clients. */
export function passwordResetEmail({
  name,
  buttonUrl,
  deepLink,
}: {
  name: string;
  /** http(s) callback URL — the only kind of link every mail client follows. */
  buttonUrl: string;
  /** `wordpoker://reset-password?token=…`, the app's own entry point. */
  deepLink: string;
}): Omit<Email, "to"> {
  const who = escapeHtml(name.trim() || "player");
  const browserHref = escapeHtml(buttonUrl);
  const appHref = escapeHtml(deepLink);
  const subject = "Reset your Word Poker password";

  const text = [
    `Hi ${name.trim() || "player"},`,
    "",
    "Someone asked to reset the password on your Word Poker account.",
    `Open this link to choose a new one (good for ${LINK_LIFETIME}):`,
    "",
    buttonUrl,
    "",
    "Reading this on the phone where Word Poker is installed? Open this link",
    "instead — it goes straight into the app:",
    "",
    deepLink,
    "",
    "If it wasn't you, ignore this email — your password stays as it is.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${brand.felt};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.felt};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${brand.card};border:1px solid ${brand.border};border-radius:14px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0;font-family:${sans};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${brand.gold};">Word Poker</p>
                <h1 style="margin:20px 0 0;font-family:${serif};font-size:24px;line-height:32px;font-weight:700;color:${brand.cream};">Reset your password.</h1>
                <p style="margin:12px 0 0;font-family:${sans};font-size:15px;line-height:22px;color:${brand.dim};">Hi ${who} — someone asked to reset the password on your Word Poker account.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
                  <tr>
                    <td style="background:${brand.gold};border-radius:4px;">
                      <a href="${appHref}" style="display:inline-block;padding:14px 28px;font-family:${sans};font-size:14px;font-weight:700;letter-spacing:0.5px;color:${brand.onGold};text-decoration:none;">Choose a new password</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-family:${sans};font-size:13px;line-height:19px;color:${brand.dim};">The link is good for ${LINK_LIFETIME} and can only be used once. If it wasn't you, ignore this email — your password stays as it is.</p>
                <p style="margin:20px 0 0;font-family:${sans};font-size:13px;line-height:19px;color:${brand.dim};">On a computer? <a href="${browserHref}" style="color:${brand.gold};text-decoration:none;">Continue in your browser</a>.</p>
                <p style="margin:8px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;word-break:break-all;color:${brand.faint};">${appHref}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/** The verification mail: one button, and the welcome coins it unlocks. */
export function verifyEmailEmail({
  name,
  buttonUrl,
  coins,
}: {
  name: string;
  /** Better Auth's http(s) verification URL; it verifies, then redirects to the callback. */
  buttonUrl: string;
  /** The welcome grant, already formatted ("5,000"). */
  coins: string;
}): Omit<Email, "to"> {
  const who = escapeHtml(name.trim() || "player");
  const href = escapeHtml(buttonUrl);
  const subject = `Confirm your email to claim your ${coins} welcome coins`;

  const text = [
    `Hi ${name.trim() || "player"},`,
    "",
    `Confirm your email to claim your ${coins} welcome coins (link good for ${LINK_LIFETIME}):`,
    "",
    buttonUrl,
    "",
    "If you didn't create a Word Poker account, ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${brand.felt};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.felt};padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:${brand.card};border:1px solid ${brand.border};border-radius:14px;">
            <tr>
              <td style="padding:32px;">
                <p style="margin:0;font-family:${sans};font-size:11px;letter-spacing:2.2px;text-transform:uppercase;color:${brand.gold};">Word Poker</p>
                <h1 style="margin:20px 0 0;font-family:${serif};font-size:24px;line-height:32px;font-weight:700;color:${brand.cream};">Claim your ${coins} coins.</h1>
                <p style="margin:12px 0 0;font-family:${sans};font-size:15px;line-height:22px;color:${brand.dim};">Hi ${who} — confirm your email and your welcome coins land in your Wallet.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
                  <tr>
                    <td style="background:${brand.gold};border-radius:4px;">
                      <a href="${href}" style="display:inline-block;padding:14px 28px;font-family:${sans};font-size:14px;font-weight:700;letter-spacing:0.5px;color:${brand.onGold};text-decoration:none;">Confirm my email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-family:${sans};font-size:13px;line-height:19px;color:${brand.dim};">The link is good for ${LINK_LIFETIME}. If you didn't create a Word Poker account, ignore this email.</p>
                <p style="margin:8px 0 0;font-family:'Courier New',Courier,monospace;font-size:12px;line-height:18px;word-break:break-all;color:${brand.faint};">${href}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
