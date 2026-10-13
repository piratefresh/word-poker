import { expo } from "@better-auth/expo";
import { anonymous } from "better-auth/plugins";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  plugins: [expo(), anonymous()],
  emailAndPassword: {
    enabled: true, // Enable authentication using email and password.
  },
});
