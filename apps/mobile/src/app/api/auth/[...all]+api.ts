import { auth } from "@/auth/server/auth";

const handler = auth.handler;
export { handler as GET, handler as POST };
