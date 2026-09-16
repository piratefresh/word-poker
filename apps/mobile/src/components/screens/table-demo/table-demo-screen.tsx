import { useState } from "react";

import { FOUR_PLAYER_FLOP_FIXTURE } from "@/components/screens/game/game-fixtures";
import { GameScreen } from "@/components/screens/game/game-screen";
import type {
  GameScreenState,
  PlayerStatus,
} from "@/components/screens/game/game-types";

/**
 * The callbacks deliberately mutate only the shared demo fixture; production
 * game/session state remains outside the presentation.
 */
export function TableDemoScreen() {
  const [game, setGame] = useState<GameScreenState>(FOUR_PLAYER_FLOP_FIXTURE);

  const setHeroStatus = (status: PlayerStatus) => {
    setGame((current) => ({
      ...current,
      players: current.players.map((player) =>
        player?.isHero ? { ...player, status } : player,
      ),
    }));
  };

  return (
    <GameScreen
      game={game}
      onCheckOrCall={() => setHeroStatus("check")}
      onFold={() => setHeroStatus("fold")}
      onRaise={(amount) =>
        setGame((current) => ({
          ...current,
          pot: current.pot + amount,
          players: current.players.map((player) =>
            player?.isHero
              ? {
                  ...player,
                  bet: amount,
                  stack: Math.max(0, player.stack - amount),
                  status: "raise",
                }
              : player,
          ),
        }))
      }
      onRaiseAmountChange={(raiseAmount) =>
        setGame((current) => ({
          ...current,
          betting: { ...current.betting, raiseAmount },
        }))
      }
    />
  );
}
