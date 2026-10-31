/**
 * social-sign-in.ts — Google and Apple through Better Auth's browser OAuth (STO-594).
 *
 * The same route on iOS, Android and web. A guest's hands and a pending referral survive it through
 * Better Auth's server-side OAuth state. Providers show only once EXPO_PUBLIC_SOCIAL_SIGN_IN lists
 * them, so a build never offers a button its server has no credentials for.
 */

import { Platform } from "react-native";

import { EMAIL_VERIFIED_CALLBACK } from "@/constants/links";
import { apiBaseURL } from "@/lib/network/api-base-url";

import { authClient } from "./auth-client";
import { rememberLastLogin } from "./last-login-client";
import { changeSession, setAutoRestore } from "./session-coordinator";

export type SocialProvider = "apple" | "google";

export type SocialResult = { ok: true } | { ok: false; message: string };

const enabled = process.env.EXPO_PUBLIC_SOCIAL_SIGN_IN?.split(",") ?? [];

/** iOS leads with Apple, which the App Store expects beside Google; Android offers Google alone. */
const PLATFORM_PROVIDERS = Platform.select<readonly SocialProvider[]>({
  ios: ["apple", "google"],
  android: ["google"],
  default: ["google", "apple"],
});

export const SOCIAL_PROVIDERS = PLATFORM_PROVIDERS.filter((provider) => enabled.includes(provider));

/** No button on Android, but an account made with Apple on iOS still has to get in: a footer link. */
export const APPLE_FOOTER_LINK = Platform.OS === "android" && enabled.includes("apple");

/** Home in the app or on this web origin: where a login lands, as a verified email does. */
const callbackURL = EMAIL_VERIFIED_CALLBACK;

const errorCallbackURL = `${apiBaseURL}/api/auth-failed${Platform.OS === "web" ? "" : "?native=1"}`;

const failed = (error: { message?: string | undefined }): SocialResult => ({ ok: false, message: error.message ?? "Something went wrong. Please try again." });

/**
 * A cancelled sheet and a refused login both resolve without an error and leave the session as it
 * was; a refusal has already said why in the sheet (`oauthFailedPage`). On web the page navigates away.
 */
export async function signInWithSocial(provider: SocialProvider, fetchOptions?: { headers: Record<string, string> }): Promise<SocialResult> {
  const { error, user } = await changeSession(async () => {
    const { error } = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL, fetchOptions });
    return { error, user: error ? null : (await authClient.getSession()).data?.user };
  });
  if (error) return failed(error);
  if (user && !user.isAnonymous) {
    await setAutoRestore(true);
    rememberLastLogin(provider);
  }
  return { ok: true };
}

/** Adds the provider to the signed-in account. An identity that belongs to another account stays there. */
export async function linkSocial(provider: SocialProvider): Promise<SocialResult> {
  const { error } = await authClient.linkSocial({ provider, callbackURL, errorCallbackURL });
  return error ? failed(error) : { ok: true };
}
