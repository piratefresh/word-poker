import { auth } from "@/lib/auth";
import { normalizePasswordResetRequest } from "@/lib/auth-request";

/**
 * This specific route takes precedence over the general Better Auth catch-all.
 * It repairs the malformed query shape seen through a Gmail redirect, then
 * delegates token validation and the redirect to Better Auth unchanged.
 */
export const GET = (request: Request) =>
  auth.handler(normalizePasswordResetRequest(request));
