import * as SecureStore from "expo-secure-store";

import { autoRestoreAllowed, setAutoRestore } from "./session-coordinator";

const mockKeychain = new Map<string, string>();
const mockKv = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockKeychain.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => void mockKeychain.set(key, value)),
  deleteItemAsync: jest.fn(async (key: string) => void mockKeychain.delete(key)),
}));
jest.mock("@/lib/storage/claim-store", () => ({
  readItem: (key: string) => mockKv.get(key) ?? null,
  writeItem: (key: string, value: string) => void mockKv.set(key, value),
}));
jest.mock("@/features/online/room-session", () => ({ leaveTable: jest.fn() }));
jest.mock("./auth-client", () => ({ authClient: {} }));

beforeEach(() => {
  mockKeychain.clear();
  mockKv.clear();
});

it("keeps a guest or sign-out choice across launches", async () => {
  await setAutoRestore(false);
  expect(await autoRestoreAllowed()).toBe(false);
  expect(await autoRestoreAllowed()).toBe(false);
});

it("forgets a choice the Keychain kept from before the app was deleted", async () => {
  await setAutoRestore(false);
  mockKv.clear(); // uninstall wipes the app's storage, not the Keychain
  expect(mockKeychain.size).toBe(1);
  expect(await autoRestoreAllowed()).toBe(true);
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
});
