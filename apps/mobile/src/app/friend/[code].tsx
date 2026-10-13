import { isFriendCode } from "@wordpoker/contracts";
import { Redirect, useLocalSearchParams } from "expo-router";

export default function FriendLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={isFriendCode(code) ? { pathname: "/friends", params: { add: code } } : "/friends"} />;
}
