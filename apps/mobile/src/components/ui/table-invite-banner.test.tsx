import { fireEvent, render } from "@testing-library/react-native";
import { router } from "expo-router";

import { TableInviteBanner } from "./table-invite-banner";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));

const invite = { fromName: "Ada", roomId: "room1" };

test("names the inviter, and Join dismisses and routes to the table", async () => {
  const onDismiss = jest.fn();
  const view = await render(<TableInviteBanner invite={invite} onDismiss={onDismiss} />);
  expect(view.getByText("Ada invited you to a table")).toBeTruthy();
  await fireEvent(view.getByTestId("table-invite-join"), "click");
  expect(onDismiss).toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledWith({ pathname: "/online/[roomId]", params: { roomId: "room1" } });
});

test("renders nothing without an invite", async () => {
  const view = await render(<TableInviteBanner invite={null} onDismiss={() => {}} />);
  expect(view.queryByTestId("table-invite-banner")).toBeNull();
});
