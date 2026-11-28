/**
 * The round-end sheets (STO-1189, R2–R4 restyled for G1): Round cleared with the prize shop, Out of
 * spins, and Run over. One frame for all three: a gold rim round a felt panel, rising over the
 * dimmed cabinet with a banner title hung on its top edge. Every number on it is the engine's.
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, SlideInDown, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SLOT_POWERS,
  addReelPrice,
  addRowPrice,
  freeZigzagPairs,
  powerCount,
  rerollPrice,
  roundTarget,
  rowCount,
  type SlotEvaluation,
  type SlotPower,
  type SlotPowerType,
  type SlotSpellerState,
  type SlotWord,
} from "@wordpoker/game-rules";

import { GameButton } from "@/components/ui/game-button";
import { fonts } from "@/constants/theme";
import { newBests, type SlotRecords } from "@/features/slot-speller/slot-speller-save";
import { payoutRows, randomSlotSeed } from "@/features/slot-speller/slot-speller-model";
import type { SlotSpeller } from "@/features/slot-speller/use-slot-speller";
import { MODAL_ORIENTATIONS } from "@/lib/ui/modal-orientations";
import { webTestID } from "@/lib/ui/web-id";

import { SlotPayoutList } from "./slot-payout-list";

/** G1's cream ink and gold. */
const CREAM = "#fff6e2";
const CREAM_DIM = "rgba(255,246,226,0.75)";
const GOLD = "#f7df7a";
const GOLD_HI = "#fff1a0";
const COCOA = "#3d1a06";
/** The tallest the sheet stands, and the widest it gets (landscape, web). */
const TOP_CLEARANCE = 56;
const MAX_WIDTH = 440;
/** The footer buttons' size: the big call to action and the button beside it stand the same height. */
const FOOTER_SCALE = 1.3;
/** The token count-up's beat. */
const COUNT_STEP_MS = 60;

/** A card's glossy candy: body top to foot, the lip under it, the orb's light. */
export interface Candy {
  body: readonly [string, string, string];
  lip: string;
  orb: string;
}

export const CANDY: Record<SlotPowerType | "upgrade", Candy> = {
  Grid: { body: ["#7ec4ff", "#2f74c8", "#1e4689"], lip: "#0b2550", orb: "#bfe3ff" },
  Lines: { body: ["#7ee8e0", "#1f9e9a", "#0f5f63"], lip: "#062f33", orb: "#c8fbf6" },
  Moves: { body: ["#ffd36a", "#e69a1e", "#b0650c"], lip: "#5a3006", orb: "#fff0c2" },
  Tiles: { body: ["#ff9a7a", "#d8503a", "#922418"], lip: "#4a0a06", orb: "#ffd3cc" },
  Scoring: { body: ["#ff9ab0", "#e0476a", "#a3213f"], lip: "#5a0b20", orb: "#ffd0dc" },
  upgrade: { body: ["#b88cff", "#7a4ad8", "#4d2a9a"], lip: "#261055", orb: "#e6d8ff" },
};

export interface SlotRoundSheetProps {
  open: boolean;
  state: SlotSpellerState;
  /** The spin that ended the round, for the result line. */
  payout: SlotEvaluation | null;
  records: SlotRecords;
  dispatch: SlotSpeller["dispatch"];
  /** The scrim was tapped: the sheet steps aside until the deck's button brings it back. */
  onDismiss: () => void;
}

/** The sheet for the round's end, by phase: the shop after a clear, Out of spins, or Run over. */
export function SlotRoundSheet({ open, state, payout, records, dispatch, onDismiss }: SlotRoundSheetProps): ReactElement | null {
  if (!open) return null;
  switch (state.phase) {
    case "shop":
      return (
        <SheetFrame title={`ROUND ${state.round} CLEARED!`} tone="win" onDismiss={onDismiss}>
          <RoundResult state={state} payout={payout} />
          <ShopBody state={state} dispatch={dispatch} />
        </SheetFrame>
      );
    case "short":
      return (
        <SheetFrame title="OUT OF SPINS" tone="short" onDismiss={onDismiss}>
          <RoundResult state={state} payout={payout} />
          <ShortBody state={state} dispatch={dispatch} />
        </SheetFrame>
      );
    case "over":
      return (
        <SheetFrame title="RUN OVER" tone="win" onDismiss={onDismiss}>
          <OverBody state={state} records={records} dispatch={dispatch} />
        </SheetFrame>
      );
    default:
      return null;
  }
}

export interface SlotPayoutSheetProps {
  state: SlotSpellerState;
  payout: SlotEvaluation;
  onDismiss: () => void;
}

/**
 * The last spin's payout (STO-1183), opened from the meter: the round sheets' frame round the spin
 * total, each word's card with the engine's working, and the way back to the reels.
 */
export function SlotPayoutSheet({ state, payout, onDismiss }: SlotPayoutSheetProps): ReactElement {
  const count = payout.words.length;
  const powers = payout.words.reduce((sum, word) => sum + word.breakdown.triggered.length, 0);
  const rows = payoutRows(payout).filter((row) => row.kind !== "total");
  return (
    <SheetFrame title="LAST SPIN" tone="win" onDismiss={onDismiss}>
      <View accessibilityLabel={`The last spin paid ${payout.total} points`} accessible style={styles.result}>
        <Text style={styles.score} testID="slot-payout-total">{`+${payout.total}`}</Text>
        <Text style={styles.dim}>
          {`Round score `}
          <Text style={styles.gold}>{`${state.roundScore} / ${state.target}`}</Text>
        </Text>
      </View>
      <View style={styles.chips}>
        <Text style={styles.chip}>{count === 1 ? "1 word" : `${count} words`}</Text>
        {powers > 0 ? <Text style={styles.chip}>{powers === 1 ? "1 power" : `${powers} powers`}</Text> : null}
      </View>
      <Divider label={count === 0 ? "NO WORDS THIS SPIN" : "HOW IT PAID"} />
      {count === 0 ? (
        <Text style={[styles.dim, styles.center]}>No line spelled a word of three letters or more.</Text>
      ) : (
        <SlotPayoutList payout={payout} rows={rows} powerMultiplier={state.config.scoringPowerMultiplier} />
      )}
      <View style={styles.footer}>
        <GameButton
          label="BACK TO THE REELS"
          variant="green"
          scale={FOOTER_SCALE}
          onPress={onDismiss}
          style={styles.grow}
          labelStyle={styles.bigLabel}
          testID="slot-payout-close"
        />
      </View>
    </SheetFrame>
  );
}

/** The shared frame: scrim, the gold rim, the felt (green, or wine when short) and the banner. */
export function SheetFrame({ title, tone, onDismiss, children }: { title: string; tone: "win" | "short"; onDismiss: () => void; children: ReactNode }): ReactElement {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const short = tone === "short";
  return (
    <Modal animationType="none" onRequestClose={onDismiss} statusBarTranslucent supportedOrientations={MODAL_ORIENTATIONS} transparent visible>
      <Animated.View entering={FadeIn.duration(200)} style={styles.scrim}>
        <Pressable accessibilityLabel="Hide the sheet" accessibilityRole="button" onPress={onDismiss} style={StyleSheet.absoluteFill} testID="slot-sheet-scrim" />
      </Animated.View>
      <Animated.View entering={SlideInDown.springify().damping(18).stiffness(170)} style={styles.slot} testID="slot-round-sheet">
        <LinearGradient colors={["#e7c75a", "#9c7620", "#7e5e16"]} locations={[0, 0.06, 1]} style={styles.rim}>
          <LinearGradient
            colors={short ? ["#4a1a1e", "#1e0c0e", "#0b0506"] : ["#135a40", "#062a1e", "#03140d"]}
            locations={[0, 0.5, 1]}
            style={styles.felt}
          >
            <ScrollView
              bounces={false}
              contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}
              style={{ maxHeight: height - insets.top - TOP_CLEARANCE }}
            >
              {children}
            </ScrollView>
          </LinearGradient>
        </LinearGradient>
        <View pointerEvents="none" style={styles.bannerSlot}>
          <LinearGradient
            colors={short ? ["#4a4540", "#2a2622", "#1c1917"] : ["#d0383f", "#b81f29", "#8b161e"]}
            style={[styles.banner, { shadowColor: short ? "#000" : "#2e0407" }]}
          >
            <Text accessibilityRole="header" style={[styles.bannerText, short && { color: "#ffb3a7" }]}>
              {title}
            </Text>
          </LinearGradient>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** The round's score over its target, how far short, and what the last spin paid. */
function RoundResult({ state, payout }: { state: SlotSpellerState; payout: SlotEvaluation | null }): ReactElement {
  const { roundScore, target } = state;
  const short = target - roundScore;
  const top = payout?.words.reduce<SlotWord | null>(
    (best, word) => (best === null || word.breakdown.score > best.breakdown.score ? word : best),
    null,
  );
  return (
    <View accessibilityLabel={`${roundScore} of ${target} points`} style={styles.result}>
      <Text style={[styles.score, short > 0 && styles.scoreShort]} testID="slot-sheet-score">
        {`${roundScore}`}
        <Text style={styles.scoreTarget}>{` / ${target}`}</Text>
      </Text>
      {short > 0 ? <Text style={styles.shortBy}>{`${short} points short`}</Text> : null}
      {payout !== null ? (
        <Text style={styles.dim}>
          {`Last spin +${payout.total}`}
          {top ? " · best word " : ""}
          {top ? <Text style={styles.gold}>{`${top.word} ${top.breakdown.score}`}</Text> : null}
        </Text>
      ) : null}
    </View>
  );
}

/** Round cleared: the tokens it paid, then the shop — three powers, Add Reel and Add Row, reroll, next round. */
function ShopBody({ state, dispatch }: { state: SlotSpellerState; dispatch: SlotSpeller["dispatch"] }): ReactElement {
  const { shop, tokens, config, reels, round } = state;
  const [pickingPair, setPickingPair] = useState(false);
  const earned = shop?.earned ?? 0;
  const spare = earned - config.clearTokens;
  const stock = (shop?.stock ?? []).flatMap((id) => SLOT_POWERS.filter((power) => power.id === id));
  const rows = rowCount(state);
  const reelPrice = addReelPrice(state);
  const rowPrice = addRowPrice(state);
  const reroll = rerollPrice(state);
  const zigzag = SLOT_POWERS.find((power) => power.id === "zigzag");

  return (
    <>
      <View style={styles.chips}>
        <Text style={styles.chip}>{`+${config.clearTokens} clear`}</Text>
        {spare > 0 ? <Text style={styles.chip}>{`+${spare} spare spins`}</Text> : null}
        <LinearGradient colors={["#ffe58a", "#f2b928", "#c98a2c"]} style={styles.tokenChip} testID="slot-shop-tokens">
          <CountUp to={tokens} from={tokens - earned} />
          <Text style={styles.tokenChipText}> tokens</Text>
        </LinearGradient>
      </View>

      <Divider label="PICK YOUR POWERS" />

      {pickingPair && zigzag !== undefined ? (
        <View style={styles.pairPick}>
          <Text style={styles.pairTitle}>{`${zigzag.name}: which rows?`}</Text>
          <View style={styles.pairButtons}>
            {freeZigzagPairs(state).map((pair) => (
              <GameButton
                key={pair}
                label={`Rows ${pair + 1}–${pair + 2}`}
                variant="gold"
                compact
                onPress={() => {
                  setPickingPair(false);
                  dispatch({ type: "buyPower", power: "zigzag", pair });
                }}
                testID={`slot-shop-zigzag-${pair}`}
              />
            ))}
            <GameButton label="Cancel" variant="dark" compact onPress={() => setPickingPair(false)} testID="slot-shop-zigzag-cancel" />
          </View>
        </View>
      ) : stock.length === 0 ? (
        <Text style={[styles.dim, styles.center]}>The power pool is empty: every power is at its max.</Text>
      ) : (
        <View style={styles.cardRow}>
          {stock.map((power) => {
            const sold = shop?.sold.includes(power.id) ?? false;
            return (
              <ShopCard
                key={power.id}
                candy={CANDY[power.type]}
                glyph={power.glyph}
                name={power.name}
                description={power.description}
                price={power.cost}
                sold={sold}
                disabled={sold || tokens < power.cost}
                onPress={() => (power.id === "zigzag" ? setPickingPair(true) : dispatch({ type: "buyPower", power: power.id }))}
                testID={`slot-shop-buy-${power.id}`}
              />
            );
          })}
        </View>
      )}

      <View style={styles.cardRow}>
        <ShopCard
          candy={CANDY.upgrade}
          glyph="+"
          name="Add Reel"
          description={`A new reel on the right. ${reels} of ${config.maxReels}.`}
          price={reels >= config.maxReels ? null : reelPrice}
          disabled={reels >= config.maxReels || tokens < reelPrice}
          onPress={() => dispatch({ type: "buyReel" })}
          testID="slot-shop-reel"
        />
        <ShopCard
          candy={CANDY.upgrade}
          glyph="R+"
          name="Add Row"
          description={`A new row and paying line. ${rows} of ${config.maxRows}.`}
          price={rows >= config.maxRows ? null : rowPrice}
          disabled={rows >= config.maxRows || tokens < rowPrice}
          onPress={() => dispatch({ type: "buyRow" })}
          testID="slot-shop-row"
        />
      </View>

      <View style={styles.footer}>
        <GameButton
          accessibilityLabel={`Reroll the shop for ${reroll} tokens`}
          variant="blue"
          disabled={tokens < reroll}
          onPress={() => {
            setPickingPair(false);
            dispatch({ type: "reroll" });
          }}
          scale={FOOTER_SCALE}
          style={styles.reroll}
          horizontalPadding={4}
          testID="slot-shop-reroll"
        >
          <View style={styles.rerollFace}>
            <Ionicons color="#fff" name="refresh" size={24} />
            <Text style={styles.rerollPrice}>{reroll}</Text>
          </View>
        </GameButton>
        <GameButton
          label={`NEXT ROUND · ${roundTarget(config, round + 1)}`}
          variant="green"
          scale={FOOTER_SCALE}
          onPress={() => dispatch({ type: "nextRound" })}
          style={styles.grow}
          labelStyle={styles.bigLabel}
          testID="slot-next-round"
        />
      </View>
    </>
  );
}

interface ShopCardProps {
  candy: Candy;
  glyph: string;
  name: string;
  description: string;
  /** `null` when it is at its max. */
  price: number | null;
  sold?: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}

/** A shop card: the orb, the name, its effect, the price, and BOUGHT once taken. Dimmed when out of reach. */
function ShopCard({ candy, glyph, name, description, price, sold = false, disabled, onPress, testID }: ShopCardProps): ReactElement {
  const label = sold ? `${name}, bought` : price === null ? `${name}, at its max` : `Buy ${name} for ${price} tokens`;
  return (
    <Pressable
      accessibilityHint={description}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      id={webTestID(testID)}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: candy.lip }, disabled && (sold ? styles.sold : styles.unaffordable), pressed && styles.pressed]}
      testID={testID}
    >
      <LinearGradient colors={candy.body} style={styles.cardFace}>
        <Orb candy={candy} glyph={glyph} size={44} />
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.cardName, { textShadowColor: candy.lip }]}>
          {name}
        </Text>
        <Text numberOfLines={3} style={styles.cardDesc}>
          {description}
        </Text>
        {price === null ? <Text style={styles.maxChip}>MAX</Text> : <PriceChip price={price} />}
      </LinearGradient>
      {sold ? <Text style={styles.stamp}>BOUGHT</Text> : null}
    </Pressable>
  );
}

/** A glossy orb with a glyph in it: a power's face on a card or a build pill. */
export function Orb({ candy, glyph, size }: { candy: Candy; glyph: string; size: number }): ReactElement {
  return (
    <LinearGradient colors={["#ffffff", candy.orb]} end={{ x: 0.7, y: 0.8 }} start={{ x: 0.3, y: 0.2 }} style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.orbGlyph, { color: candy.lip, fontSize: size * 0.4 }]}>
        {glyph}
      </Text>
    </LinearGradient>
  );
}

function PriceChip({ price }: { price: number }): ReactElement {
  return (
    <LinearGradient colors={["#ffe58a", "#f2b928", "#c98a2c"]} style={styles.price}>
      <View style={styles.coin}>
        <Text style={styles.coinText}>T</Text>
      </View>
      <Text style={styles.priceText}>{price}</Text>
    </LinearGradient>
  );
}

/** The tokens counting up, one a beat, from before the clear paid them; a buy counts them down. Still under reduced motion. */
function CountUp({ from, to }: { from: number; to: number }): ReactElement {
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (value === to) return;
    const timer = setTimeout(() => setValue(value + Math.sign(to - value)), COUNT_STEP_MS);
    return () => clearTimeout(timer);
  }, [value, to]);
  return <Text style={styles.tokenChipText}>{reduceMotion ? to : value}</Text>;
}

export function Divider({ label }: { label: string }): ReactElement {
  return (
    <View style={styles.divider}>
      <LinearGradient colors={["transparent", "rgba(247,223,122,0.6)"]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.rule} />
      <Text style={styles.dividerText}>{label}</Text>
      <LinearGradient colors={["rgba(247,223,122,0.6)", "transparent"]} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={styles.rule} />
    </View>
  );
}

/** Out of spins: one more spin for its tokens (once a round), or end the run. */
function ShortBody({ state, dispatch }: { state: SlotSpellerState; dispatch: SlotSpeller["dispatch"] }): ReactElement {
  const cost = state.config.extraSpinCost;
  const why = state.extraSpinUsed
    ? "This round's extra spin is used"
    : state.tokens < cost
      ? `One more spin costs ${cost} tokens · you have ${state.tokens}`
      : `Once per round · you have ${state.tokens} tokens`;
  return (
    <>
      {state.extraSpinUsed || state.tokens < cost ? null : (
        <GameButton
          label="ONE MORE SPIN"
          labelAccent={` · ${cost}`}
          accessibilityLabel={`One more spin for ${cost} tokens`}
          variant="gold"
          scale={1.4}
          onPress={() => dispatch({ type: "extraSpin" })}
          labelStyle={styles.bigLabel}
          testID="slot-extra-spin"
        />
      )}
      <Text style={[styles.dim, styles.center]}>{why}</Text>
      <GameButton label="End run" variant="danger" onPress={() => dispatch({ type: "endRun" })} style={styles.endRun} labelStyle={styles.label} testID="slot-end-run" />
    </>
  );
}

/** Run over: the round reached, the best word as tiles, the build, the device's records, and go again. */
function OverBody({ state, records, dispatch }: { state: SlotSpellerState; records: SlotRecords; dispatch: SlotSpeller["dispatch"] }): ReactElement {
  const held = SLOT_POWERS.filter((power) => powerCount(state.powers, power.id) > 0);
  const flags = newBests(records);
  const best = state.bestWord;
  return (
    <>
      <View style={styles.overTop}>
        <LinearGradient colors={["#fff1b0", "#e7c75a", "#c79a2e", "#7e5e16"]} style={styles.medal}>
          <LinearGradient colors={["#d0383f", "#8b161e"]} style={styles.medalFace}>
            <Text style={styles.medalLabel}>ROUND</Text>
            <Text style={styles.medalValue} testID="slot-over-round">{`${state.round}`}</Text>
          </LinearGradient>
        </LinearGradient>
        <View style={styles.grow}>
          <Text style={styles.sectionLabel}>{best === null ? "BEST WORD" : `BEST WORD · ${best.score}`}</Text>
          <View accessibilityLabel={best === null ? "No word scored" : `${best.word}, ${best.score} points`} style={styles.tiles}>
            {best === null ? (
              <Text style={styles.dim}>No word scored</Text>
            ) : (
              [...best.word].map((letter, index) => (
                <LinearGradient key={index} colors={["#fff6c8", "#f7df7a", "#e6a73e"]} style={styles.tile}>
                  <Text style={styles.tileText}>{letter}</Text>
                </LinearGradient>
              ))
            )}
          </View>
          <Text style={styles.dim}>{`${state.reels} reels × ${rowCount(state)} rows · seed ${state.seed}`}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>YOUR BUILD</Text>
        <View style={styles.pills}>
          {held.length === 0 ? <Text style={styles.dim}>No powers this run</Text> : held.map((power) => <PowerPill key={power.id} power={power} count={powerCount(state.powers, power.id)} />)}
        </View>
      </View>

      <View style={styles.records} testID="slot-records">
        <RecordTile value={records.furthestRound === 0 ? "–" : `${records.furthestRound}`} label="Furthest round cleared" isNew={flags.furthestRound} />
        <RecordTile value={records.bestWord === null ? "–" : `${records.bestWord.score}`} label="Best word score" isNew={flags.bestWord} />
        <RecordTile value={`${records.discovered.length}/${SLOT_POWERS.length}`} label="Powers discovered" isNew={flags.discovered} />
      </View>

      <View style={styles.footer}>
        <GameButton label="Replay seed" variant="blue" scale={FOOTER_SCALE} onPress={() => dispatch({ type: "newRun", seed: state.seed })} labelStyle={styles.label} testID="slot-replay-seed" />
        <GameButton
          label="NEW RUN"
          variant="green"
          scale={FOOTER_SCALE}
          onPress={() => dispatch({ type: "newRun", seed: randomSlotSeed() })}
          style={styles.grow}
          labelStyle={styles.bigLabel}
          testID="slot-new-run"
        />
      </View>
    </>
  );
}

function PowerPill({ power, count }: { power: SlotPower; count: number }): ReactElement {
  const candy = CANDY[power.type];
  return (
    <LinearGradient colors={candy.body} style={[styles.pill, { shadowColor: candy.lip }]}>
      <Orb candy={candy} glyph={power.glyph} size={26} />
      <Text style={[styles.pillText, { textShadowColor: candy.lip }]}>{count > 1 ? `${power.name} ×${count}` : power.name}</Text>
    </LinearGradient>
  );
}

export function RecordTile({ value, label, isNew }: { value: string; label: string; isNew: boolean }): ReactElement {
  return (
    <View accessibilityLabel={`${label}: ${value}${isNew ? ", new best" : ""}`} style={styles.record}>
      <Text style={styles.recordValue}>{value}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
      {isNew ? <Text style={styles.newBest}>NEW BEST</Text> : null}
    </View>
  );
}

const shadow = (offset: number) => ({ textShadowOffset: { width: 0, height: offset }, textShadowRadius: 0.01 });

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(2,10,7,0.65)" },
  slot: { position: "absolute", bottom: 0, alignSelf: "center", width: "100%", maxWidth: MAX_WIDTH, paddingTop: 22 },
  rim: { paddingTop: 8, paddingHorizontal: 8, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  felt: { borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
  body: { gap: 12, paddingTop: 34, paddingHorizontal: 14 },
  bannerSlot: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" },
  banner: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 26,
    borderRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 6,
  },
  bannerText: { fontFamily: fonts.ui, fontSize: 24, lineHeight: 28, color: "#fbe6a6", textShadowColor: COCOA, ...shadow(2) },

  result: { alignItems: "center", gap: 2 },
  score: { fontFamily: fonts.ui, fontSize: 48, lineHeight: 54, color: GOLD_HI, textShadowColor: "#7a4a10", ...shadow(3) },
  scoreShort: { color: "#ffffff", textShadowColor: "#5a0b10" },
  scoreTarget: { fontSize: 24, color: "rgba(255,246,226,0.7)", textShadowColor: "#000" },
  shortBy: { fontFamily: fonts.ui, fontSize: 15, color: "#ffb3a7" },
  dim: { fontFamily: fonts.uiMedium, fontSize: 13, color: CREAM_DIM },
  gold: { color: GOLD },
  center: { textAlign: "center" },

  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 6 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(247,223,122,0.4)",
    backgroundColor: "rgba(247,223,122,0.14)",
    overflow: "hidden",
    fontFamily: fonts.ui,
    fontSize: 13,
    color: "#fff6c8",
  },
  tokenChip: { flexDirection: "row", alignItems: "center", paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999 },
  tokenChipText: { fontFamily: fonts.ui, fontSize: 14, color: COCOA },

  divider: { flexDirection: "row", alignItems: "center", gap: 8 },
  rule: { flex: 1, height: 2 },
  dividerText: { fontFamily: fonts.ui, fontSize: 14, letterSpacing: 1.5, color: GOLD },

  cardRow: { flexDirection: "row", gap: 8 },
  card: { flex: 1, borderRadius: 18, paddingBottom: 4 },
  cardFace: { flex: 1, alignItems: "center", gap: 3, paddingTop: 10, paddingBottom: 10, paddingHorizontal: 6, borderRadius: 18 },
  sold: { opacity: 0.75 },
  unaffordable: { opacity: 0.45 },
  pressed: { transform: [{ translateY: 2 }] },
  cardName: { fontFamily: fonts.ui, fontSize: 15, lineHeight: 18, color: "#ffffff", ...shadow(2) },
  cardDesc: { flex: 1, fontFamily: fonts.uiMedium, fontSize: 11, lineHeight: 14, textAlign: "center", color: "rgba(255,255,255,0.92)" },
  orb: { alignItems: "center", justifyContent: "center" },
  orbGlyph: { fontFamily: fonts.ui, paddingHorizontal: 3 },
  price: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2, paddingVertical: 2, paddingLeft: 3, paddingRight: 10, borderRadius: 999 },
  coin: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: "#7a4a10", backgroundColor: "#fff6c8", alignItems: "center", justifyContent: "center" },
  coinText: { fontFamily: fonts.ui, fontSize: 10, lineHeight: 12, color: "#7a4a10" },
  priceText: { fontFamily: fonts.ui, fontSize: 15, color: COCOA },
  maxChip: { marginTop: 2, paddingVertical: 2, paddingHorizontal: 10, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.3)", fontFamily: fonts.ui, fontSize: 13, color: "#ffffff" },
  stamp: {
    position: "absolute",
    top: 8,
    right: -4,
    transform: [{ rotate: "12deg" }],
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    fontFamily: fonts.ui,
    fontSize: 12,
    color: "#0b6b36",
  },

  pairPick: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.35)", borderWidth: 1, borderColor: "rgba(247,223,122,0.3)" },
  pairTitle: { fontFamily: fonts.ui, fontSize: 15, color: CREAM, textAlign: "center" },
  pairButtons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },

  footer: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 2 },
  grow: { flex: 1 },
  reroll: { width: 76 },
  rerollFace: { alignItems: "center" },
  rerollPrice: { fontFamily: fonts.ui, fontSize: 14, lineHeight: 16, color: "#ffffff" },
  label: { fontFamily: fonts.ui },
  bigLabel: { fontFamily: fonts.ui, letterSpacing: 0.5 },
  endRun: { alignSelf: "center", minWidth: 160 },

  overTop: { flexDirection: "row", alignItems: "center", gap: 14 },
  medal: { width: 92, height: 92, borderRadius: 46, padding: 5 },
  medalFace: { flex: 1, borderRadius: 41, alignItems: "center", justifyContent: "center" },
  medalLabel: { fontFamily: fonts.ui, fontSize: 11, letterSpacing: 1, color: "#fbe6a6" },
  medalValue: { fontFamily: fonts.ui, fontSize: 38, lineHeight: 42, color: "#ffffff", textShadowColor: "#2e0407", ...shadow(3) },
  section: { gap: 6 },
  sectionLabel: { fontFamily: fonts.ui, fontSize: 13, letterSpacing: 1, color: GOLD },
  tiles: { flexDirection: "row", gap: 4, marginVertical: 4 },
  tile: { flex: 1, maxWidth: 40, height: 40, borderRadius: 7, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: "#b8702a" },
  tileText: { fontFamily: fonts.ui, fontSize: 20, color: "#2b1810" },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 999,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  pillText: { fontFamily: fonts.ui, fontSize: 13, color: "#ffffff", ...shadow(1) },
  records: { flexDirection: "row", gap: 8, paddingTop: 6 },
  record: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(247,223,122,0.25)",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  recordValue: { fontFamily: fonts.ui, fontSize: 20, color: GOLD_HI },
  recordLabel: { fontFamily: fonts.uiMedium, fontSize: 11, lineHeight: 14, textAlign: "center", color: CREAM_DIM },
  newBest: {
    position: "absolute",
    top: -8,
    right: -4,
    transform: [{ rotate: "10deg" }],
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "#ff8a5c",
    fontFamily: fonts.ui,
    fontSize: 10,
    color: "#2a1906",
  },
});
