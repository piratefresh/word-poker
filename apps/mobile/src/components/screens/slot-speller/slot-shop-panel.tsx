import type { ReactElement } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  SLOT_POWERS,
  addReelPrice,
  rerollPrice,
  roundTarget,
  type SlotPower,
  type SlotPowerId,
  type SlotPowerType,
  type SlotSpellerState,
} from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { colors, fonts, fontSize, radius, spacing, type } from "@/constants/theme";

import { OutcomeCard } from "./slot-outcome-panels";

/** Each power type's glyph colour, so a card reads as Grid, Lines, Moves, Tiles or Scoring at a glance. */
const TYPE_COLORS: Record<SlotPowerType, string> = {
  Grid: colors.info,
  Lines: colors.successHi,
  Moves: colors.gold,
  Tiles: colors.warning,
  Scoring: colors.danger,
};

/** A power's glyph in its type's colour. */
export function PowerGlyph({ power }: { power: SlotPower }): ReactElement {
  const color = TYPE_COLORS[power.type];
  return (
    <View style={[styles.glyph, { borderColor: color }]}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.glyphText, { color }]}>
        {power.glyph}
      </Text>
    </View>
  );
}

export interface SlotShopPanelProps {
  state: SlotSpellerState;
  onBuyPower: (power: SlotPowerId) => void;
  onBuyReel: () => void;
  onReroll: () => void;
  onNextRound: () => void;
}

/** The shop a cleared round opens: three power cards, Add Reel, a reroll, and on to the next round. */
export function SlotShopPanel({ state, onBuyPower, onBuyReel, onReroll, onNextRound }: SlotShopPanelProps): ReactElement {
  const { shop, tokens, config, reels, round } = state;
  const stock = (shop?.stock ?? []).flatMap((id) => SLOT_POWERS.filter((power) => power.id === id));
  const reelPrice = addReelPrice(state);
  const atMax = reels >= config.maxReels;
  const reroll = rerollPrice(state);

  return (
    <OutcomeCard title={`Round ${round} cleared`}>
      <View style={styles.summary}>
        <Text style={styles.tokens} testID="slot-shop-tokens">{`${tokens} tokens`}</Text>
        <Text style={styles.dim}>
          {`+${shop?.earned ?? 0} tokens (${config.clearTokens} for the clear, ${config.tokensPerUnusedSpin} per unused spin)`}
        </Text>
        <Text style={styles.dim}>{`Next target: ${roundTarget(config, round + 1)}`}</Text>
      </View>

      {stock.length === 0 ? (
        <Text style={styles.dim}>The power pool is empty — every power is at its max.</Text>
      ) : (
        stock.map((power) => {
          const sold = shop?.sold.includes(power.id) ?? false;
          return (
            <ShopCard
              key={power.id}
              glyph={<PowerGlyph power={power} />}
              name={power.name}
              description={power.description}
              label={sold ? "Bought" : `Buy · ${power.cost}`}
              disabled={sold || tokens < power.cost}
              onPress={() => onBuyPower(power.id)}
              testID={`slot-shop-buy-${power.id}`}
            />
          );
        })
      )}

      <ShopCard
        glyph={
          <View style={[styles.glyph, { borderColor: colors.goldHi }]}>
            <Text style={[styles.glyphText, { color: colors.goldHi }]}>+</Text>
          </View>
        }
        name="Add Reel"
        description={`A new reel on the right. ${reels} of ${config.maxReels}.`}
        label={atMax ? "Max" : `Buy · ${reelPrice}`}
        disabled={atMax || tokens < reelPrice}
        onPress={onBuyReel}
        testID="slot-shop-reel"
      />

      <View style={styles.actions}>
        <GameButton
          label={`Reroll · ${reroll}`}
          variant="dark"
          disabled={tokens < reroll}
          onPress={onReroll}
          style={styles.action}
          testID="slot-shop-reroll"
        />
        <GameButton label="Next round" variant="gold" onPress={onNextRound} style={styles.action} testID="slot-next-round" />
      </View>
    </OutcomeCard>
  );
}

interface ShopCardProps {
  glyph: ReactElement;
  name: string;
  description: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}

function ShopCard({ glyph, name, description, label, disabled, onPress, testID }: ShopCardProps): ReactElement {
  return (
    <View style={styles.card}>
      {glyph}
      <View style={styles.cardText}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.dim}>{description}</Text>
      </View>
      <GameButton label={label} variant="gold" compact disabled={disabled} onPress={onPress} horizontalPadding={10} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.xxs },
  tokens: { fontFamily: fonts.ui, fontSize: fontSize.bodyLg, color: colors.goldHi },
  dim: { ...type.bodyDim, fontSize: fontSize.small },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.ui, fontSize: fontSize.body, color: colors.textBright },
  glyph: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: 1.5,
    backgroundColor: colors.surfaceStrong,
  },
  glyphText: { fontFamily: fonts.ui, fontSize: fontSize.body, paddingHorizontal: 2 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
});
