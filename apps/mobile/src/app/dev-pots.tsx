import { useLocalSearchParams } from "expo-router";

import type { Dictionary } from "@wordpoker/game-rules";

import { FREE_PLAY } from "@/components/hud";
import { GameScreen } from "@/components/screens/game/game-screen";
import type { GamePot } from "@/components/screens/game/game-types";
import { WordBuilder, WordCheckButton, WordHand, WordShuffleButton } from "@/components/word-builder";
import { useOfflineGame } from "@/features/offline/use-offline-game";
import { useDictionary } from "@/features/table/use-dictionary";

/**
 * Development stage for the felt's pot plates (STO-958): `/dev-pots?n=1…4` is the real offline
 * table — rack, builder, Practice pill and all — with its pots swapped for that many layers, each
 * eligible for one seat fewer than the layer below. The Maestro flow `.maestro/felt-pots.yaml`
 * screenshots each. Renders nothing in a release build.
 */
export default function DevPots() {
  const dictionary = useDictionary();
  if (!__DEV__ || dictionary === null) return null;
  return <PotsTable dictionary={dictionary} />;
}

function PotsTable({ dictionary }: { dictionary: Dictionary }) {
  const { n } = useLocalSearchParams<{ n?: string }>();
  const offline = useOfflineGame({ seed: 7578, dictionary });
  const { game, words } = offline;

  const ids = game.players.flatMap((player) => (player ? [player.id] : []));
  const count = Math.min(4, Math.max(1, Number(n) || 1));
  const amounts = [90, 140, 60, 30];
  const pots: GamePot[] = Array.from({ length: count }, (_, index) => ({
    amount: amounts[index] ?? 0,
    eligible: ids.slice(index),
  }));
  const pot = pots.reduce((total, layer) => total + layer.amount, 0);

  return (
    <WordBuilder
      community={game.community}
      wordCheck={offline.wordCheck}
      onCheckWord={offline.checkWord}
      confirmable={words?.confirmable ?? false}
      confirmed={words?.confirmed ?? false}
      onDraft={offline.setDraft}
      open={words?.open ?? false}
      plays={words?.plays ?? []}
      privateTiles={game.privateTiles}
      reason={words?.reason ?? null}
      score={words?.score ?? null}
      word={words?.word ?? ""}
    >
      <GameScreen
        balance={FREE_PLAY}
        game={{ ...game, pot, pots }}
        onAllIn={offline.allIn}
        onBet={offline.wager}
        onCheckOrCall={offline.primary}
        onChipFlightEnd={offline.endChipFlight}
        onFold={offline.fold}
        onRaise={offline.wager}
        rack={
          <WordHand
            actions={
              <>
                <WordShuffleButton />
                <WordCheckButton />
              </>
            }
          />
        }
      />
    </WordBuilder>
  );
}
