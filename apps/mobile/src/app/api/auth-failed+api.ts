import { oauthFailedPage } from "@/auth/server/reset-password-web";

/** The `errorCallbackURL` of every Google and Apple login; see `oauthFailedPage`. */
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return oauthFailedPage(searchParams.get("error"), searchParams.has("native") ? "wordpoker://" : "/sign-in");
}
