import { authClient } from "@/auth/client/auth-client";
import { authenticateTableClient, gameClient, tableClient } from "./game-client";

jest.mock("@/auth/client/auth-client", () => ({ authClient: { getSession: jest.fn() } }));
jest.mock("expo-constants", () => ({ expoConfig: { hostUri: "localhost:8081" } }));
jest.mock("@colyseus/sdk", () => ({ Client: jest.fn().mockImplementation(() => ({ auth: {} })) }));

test("refreshes the Better Auth session token for tables, keeping the lobby anonymous", async () => {
  jest.mocked(authClient.getSession).mockResolvedValue({ data: { session: { token: "session-a" } }, error: null } as Awaited<ReturnType<typeof authClient.getSession>>);
  await authenticateTableClient();
  expect(authClient.getSession).toHaveBeenCalledWith({ query: { disableCookieCache: true } });
  expect(tableClient.auth.token).toBe("session-a");
  expect(gameClient.auth.token).toBeUndefined();
});

test("clears stale table credentials when signed out or the session lookup fails", async () => {
  tableClient.auth.token = "old-account";
  jest.mocked(authClient.getSession).mockResolvedValue({ data: null, error: null });
  await expect(authenticateTableClient()).rejects.toThrow("Sign in to join");
  expect(tableClient.auth.token).toBe("");
});
