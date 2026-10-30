import { lastLoginMethodClient } from "better-auth/client/plugins";

/** The server's `lastLoginMethod` plugin sets a readable cookie on a successful sign-in. */
export const lastLoginClient = () => lastLoginMethodClient();
