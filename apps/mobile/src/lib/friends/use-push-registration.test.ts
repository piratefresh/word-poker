import * as Notifications from "expo-notifications";

jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn() }));
jest.mock("expo-secure-store", () => ({}));
jest.mock("@/lib/friends/friends-client", () => ({}));

test("pushes that arrive while the app is open are shown, not dropped", async () => {
  const { FOREGROUND_BEHAVIOR } = jest.requireActual<typeof import("./use-push-registration")>("./use-push-registration");
  const [[handler]] = jest.mocked(Notifications.setNotificationHandler).mock.calls;
  await expect(handler?.handleNotification({} as Notifications.Notification)).resolves.toBe(FOREGROUND_BEHAVIOR);
  expect(FOREGROUND_BEHAVIOR).toMatchObject({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true });
});
