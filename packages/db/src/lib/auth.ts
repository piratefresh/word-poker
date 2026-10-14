import { expo } from "@better-auth/expo";
import { anonymous } from "better-auth/plugins";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  plugins: [expo(), anonymous()],
  emailAndPassword: {
    enabled: true, // Enable authentication using email and password.
  },
  // Schema only: mirrors the runtime config's extra column and rate-limit table (STO-593).
  user: { additionalFields: { primaryIdentityVerified: { type: "boolean", defaultValue: false, required: false, input: false } } },
  rateLimit: { storage: "database" },
});
