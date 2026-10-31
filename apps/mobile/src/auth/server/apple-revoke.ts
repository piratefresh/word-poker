/**
 * Apple requires an app with Sign in with Apple to revoke the player's token when their account is
 * deleted. A failure is logged, never raised: the player asked for their data to go, and that must
 * not hang on Apple being reachable.
 */
export async function revokeAppleToken(refreshToken: string, post: typeof fetch = fetch): Promise<void> {
  try {
    const response = await post("https://appleid.apple.com/auth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.APPLE_CLIENT_ID ?? "",
        client_secret: process.env.APPLE_CLIENT_SECRET ?? "",
        token: refreshToken,
        token_type_hint: "refresh_token",
      }),
    });
    if (!response.ok) console.error(`[delete-account] Apple refused the revocation: ${response.status}`);
  } catch (error) {
    console.error(`[delete-account] could not reach Apple: ${error instanceof Error ? error.name : "unknown"}`);
  }
}
