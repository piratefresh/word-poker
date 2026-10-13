import { BottomSheet, Button, Column, Host, Text } from "@expo/ui";
import { GAME_EVENTS, GAME_MESSAGES, isBefriendResult } from "@wordpoker/contracts";
import { useEffect, useState } from "react";
import type { GamePlayer } from "@/components/screens/game/game-types";
import type { GameRoomLike } from "@/features/online/use-online-game";
import { colors, spacing } from "@/constants/theme";

export function SeatFriendSheet({ player, room, onClose }: {
  player: GamePlayer; room: GameRoomLike; onClose: () => void;
}) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => room.onMessage(GAME_EVENTS.befriendResult, (payload) => {
    if (!isBefriendResult(payload) || payload.playerId !== player.id) return;
    setMessage(payload.message);
    setPending(false);
  }), [player.id, room]);

  return <Host colorScheme="dark" seedColor={colors.gold}>
    <BottomSheet isPresented onDismiss={onClose} testID="seat-friend-sheet">
      <Column spacing={spacing.md} style={{ padding: spacing.lg }}>
        <Text>{player.name}</Text>
        {message ? <Text testID="seat-friend-result">{message}</Text> : <Button
          label="ADD FRIEND" testID="seat-add-friend" disabled={pending}
          onPress={() => {
            setPending(true);
            room.send(GAME_MESSAGES.befriend, { playerId: player.id });
          }}
        />}
        <Button label="Done" onPress={onClose} variant="outlined" />
      </Column>
    </BottomSheet>
  </Host>;
}
