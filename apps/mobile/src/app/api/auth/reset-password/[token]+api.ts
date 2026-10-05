import { auth } from "@/auth/server/auth";
import { normalizePasswordResetRequest } from "@/auth/server/auth-request";
import {
  deepLinkInterstitial,
  webResetPasswordPage,
} from "@/auth/server/reset-password-web";

/** Phones (and tablets) run the native app; everything else is treated as desktop. */
const MOBILE_UA = /android|iphone|ipad|ipod|mobile/i;

/** The reset token is the final path segment: `/api/auth/reset-password/<token>`. */
function tokenFromRequest(request: Request): string | null {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const last = segments.at(-1);
  return last && segments.at(-2) === "reset-password" ? last : null;
}

/**
 * This specific route takes precedence over the general Better Auth catch-all.
 * The mail's http button lands here so any mail client can follow it; where it
 * goes next depends on the device.
 *
 * - Phone: let Better Auth validate the token and produce its `wordpoker://`
 *   redirect (repairing the Gmail-mangled query first), then serve that as an
 *   interstitial so the app reliably opens.
 * - Desktop: there is no app to open, so serve a web form that resets over the
 *   same API endpoint.
 */
export const GET = async (request: Request): Promise<Response> => {
  const isMobile = MOBILE_UA.test(request.headers.get("user-agent") ?? "");

  if (isMobile) {
    const response = await auth.handler(normalizePasswordResetRequest(request));
    const location = response.headers.get("location");

    // Better Auth answers a valid (or invalid) token with a 3xx to the app's
    // custom scheme. Wrap only that; pass any other response through unchanged.
    if (
      response.status >= 300 &&
      response.status < 400 &&
      location &&
      !/^https?:/i.test(location)
    ) {
      return deepLinkInterstitial(location);
    }

    return response;
  }

  const token = tokenFromRequest(request);

  if (!token) {
    return auth.handler(normalizePasswordResetRequest(request));
  }

  return webResetPasswordPage(token);
};
