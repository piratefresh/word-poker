/**
 * quests-screen.tsx — Quests (STO-525): the Wallet's total, the login streak, and the catalog,
 * drawn as a cream fridge door (design "Quests Screen Ideas" 1b).
 *
 * Black-and-gold tile magnets spell QUESTS, the streak is a row of chip magnets (gold for the days
 * claimed), and every catalog quest is a sticky note. Open quests sit on top; done ones move to the
 * Done pile with a tick and their paid reward. `useQuests()` already holds the state — this screen
 * only draws it, and pulls a fresh read on mount so a day's streak credit from an earlier launch is
 * not stuck showing yesterday's.
 */

import { STREAK_REWARDS, isAccountEligible } from "@wordpoker/contracts";
import { QUEST_CATALOG } from "@wordpoker/game-rules";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, type ReactElement } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authClient } from "@/auth/client/auth-client";
import { CoinChip } from "@/components/chip/coin-chip";
import { chipTones, fonts, ledger, spacing } from "@/constants/theme";
import { useQuests } from "@/lib/quests/quests-provider";
import { formatCoins } from "@/lib/ui/format";

/** The fridge's own colours: enamel, chrome, and the sticky-note papers. */
const FRIDGE = {
  enamel: ["#d8ccb2", "#efe5cf", "#f7eedb", "#ebdfc6", "#d3c6aa"],
  seam: "#b9a988",
  chrome: ["#8d9196", "#eef1f3", "#b7bbbf", "#6e7276"],
  pill: "#1f4a33",
  tile: ["#34313c", "#141318"],
  tileInk: "#f2c75a",
  ink: "#2a2210",
  inkBody: "#2f2616",
  tick: "#c2352b",
  paid: "#2a7a4b",
  papers: ["#ffe98a", "#ffd0dc", "#cfe8ff", "#d6f2c4", "#ffdcb0"],
  magnets: [chipTones.red.base, chipTones.blue.base, chipTones.green.base, chipTones.black.base, chipTones.gold.base],
} as const;

const TITLE = [
  { letter: "Q", value: 10, tilt: -6, drop: 0 },
  { letter: "U", value: 1, tilt: 3, drop: 3 },
  { letter: "E", value: 1, tilt: -2, drop: -1 },
  { letter: "S", value: 1, tilt: 5, drop: 2 },
  { letter: "T", value: 1, tilt: -4, drop: 0 },
  { letter: "S", value: 1, tilt: 2, drop: 4 },
] as const;

/** A quest title in a hand's sentence case: "SHORT AND SWEET" → "Short and sweet". */
function handwritten(title: string): string {
  return title.charAt(0) + title.slice(1).toLowerCase();
}

/** A small, fixed lean per note, so the door looks stuck-on by hand without moving between renders. */
function lean(index: number): string {
  return `${(((index * 37) % 5) - 2) * 0.8}deg`;
}

export function QuestsScreen(): ReactElement {
  const insets = useSafeAreaInsets();
  const { data: session } = authClient.useSession();
  const { coins, state, refresh } = useQuests();

  // One pull on the way in: the provider's own read ran at launch, and a day may have turned
  // since then.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const user = session?.user;
  const signedOut = !user;
  const unverified = Boolean(user) && !isAccountEligible(user);
  const current = state?.streak.current ?? 0;

  const quests = QUEST_CATALOG.map((def, index) => {
    const row = state?.quests.find((candidate) => candidate.id === def.id);
    return { def, index, progress: row?.progress ?? 0, done: row?.done ?? false };
  });
  const open = quests.filter((quest) => !quest.done);
  const done = quests.filter((quest) => quest.done);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={FRIDGE.enamel} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.seam, { top: insets.top + 52 }]} />
      <LinearGradient colors={FRIDGE.chrome} end={{ x: 1, y: 0 }} start={{ x: 0, y: 0 }} style={[styles.handle, { top: insets.top + 110 }]} />

      <View style={[styles.hud, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.pill}
          testID="quests-back"
        >
          <Text style={styles.pillText}>‹ BACK</Text>
        </Pressable>
        {signedOut || unverified ? null : (
          <View
            accessibilityLabel={coins === null ? "Coins loading" : `${formatCoins(coins)} coins`}
            style={[styles.pill, styles.wallet]}
            testID="quest-wallet"
          >
            <CoinChip size={18} />
            <Text style={styles.pillText}>{coins === null ? "—" : formatCoins(coins)}</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        <View accessibilityLabel="Quests" accessibilityRole="header" style={styles.title}>
          {TITLE.map((tile, index) => (
            <View
              key={index}
              style={[styles.tile, { transform: [{ rotate: `${tile.tilt}deg` }, { translateY: tile.drop }] }]}
            >
              <Text style={styles.tileLetter}>{tile.letter}</Text>
              <Text style={styles.tileValue}>{tile.value}</Text>
            </View>
          ))}
        </View>

        {signedOut ? (
          <Note index={0} testID="quests-signed-out" title="Sign in to earn coins" wide />
        ) : unverified ? (
          <Note index={1} testID="quests-unverified" title="Verify your email to earn coins" wide />
        ) : (
          <>
            <StreakMagnets current={current} />

            <View style={styles.grid}>
              {open.map(({ def, index, progress }) => (
                <QuestNote
                  description={def.description}
                  goal={def.goal}
                  id={def.id}
                  index={index}
                  key={def.id}
                  progress={progress}
                  reward={def.reward}
                  title={def.title}
                />
              ))}
            </View>

            {done.length > 0 ? (
              <>
                <View style={styles.doneRule}>
                  <Text style={styles.doneLabel}>DONE</Text>
                  <View style={styles.doneDash} />
                  <Text style={styles.doneCount}>{`${done.length} of ${quests.length}`}</Text>
                </View>
                <View style={styles.grid}>
                  {done.map(({ def, index }) => (
                    <DoneNote id={def.id} index={index} key={def.id} reward={def.reward} title={def.title} />
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** Seven chip magnets, one per `STREAK_REWARDS` day: the days claimed so far are gold, today lifts. */
function StreakMagnets({ current }: { current: number }): ReactElement {
  const length = STREAK_REWARDS.length;
  // Day 8 starts the cycle again, so the strip shows where in the week the streak is.
  const claimed = current > 0 ? ((current - 1) % length) + 1 : 0;
  const next = STREAK_REWARDS[current % length];
  const line =
    current > 0 ? `Day ${current} streak. Come back tomorrow for +${next}.` : "Play today to start your streak.";

  return (
    <View style={styles.streak} testID="quest-streak">
      <View style={styles.streakRow}>
        {STREAK_REWARDS.map((reward, index) => {
          const lit = index < claimed;
          const today = index === claimed - 1;
          return (
            <View
              accessibilityLabel={`Day ${index + 1}, ${reward} coins${lit ? ", claimed" : ""}`}
              key={index}
              style={styles.streakDay}
              testID={`quest-streak-pip-${index + 1}`}
            >
              <View style={[styles.magnet, today && styles.magnetToday]}>
                <CoinChip practice={!lit} size={38} />
                <Text style={styles.magnetDay}>{index + 1}</Text>
              </View>
              <Text style={styles.magnetReward}>{`+${reward}`}</Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.streakLine}>{line}</Text>
    </View>
  );
}

/** A plain sticky note: the signed-out and unverified messages. */
function Note({ title, index, testID, wide }: { title: string; index: number; testID: string; wide?: boolean }) {
  return (
    <View style={[styles.note, wide && styles.noteWide, { backgroundColor: FRIDGE.papers[index], transform: [{ rotate: lean(index) }] }]} testID={testID}>
      <View style={[styles.noteMagnet, { backgroundColor: FRIDGE.magnets[index] }]} />
      <Text style={styles.noteTitle}>{title}</Text>
    </View>
  );
}

function QuestNote({
  id,
  index,
  title,
  description,
  goal,
  reward,
  progress,
}: {
  id: string;
  index: number;
  title: string;
  description: string;
  goal: number;
  reward: number;
  progress: number;
}): ReactElement {
  const counting = goal > 1;
  return (
    <View
      style={[styles.note, { backgroundColor: FRIDGE.papers[index % FRIDGE.papers.length], transform: [{ rotate: lean(index) }] }]}
      testID={`quest-row-${id}`}
    >
      <View style={[styles.noteMagnet, { backgroundColor: FRIDGE.magnets[(index * 2) % FRIDGE.magnets.length] }]} />
      <Text style={styles.noteTitle}>{handwritten(title)}</Text>
      <Text style={styles.noteBody}>{description}</Text>
      <View style={styles.noteFoot}>
        <Text style={counting ? styles.noteCount : styles.noteOnce}>{counting ? `${progress}/${goal}` : "ONCE"}</Text>
        <Reward amount={reward} />
      </View>
      {counting ? (
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.min(100, Math.round((progress / goal) * 100))}%` }]} />
        </View>
      ) : null}
    </View>
  );
}

function DoneNote({ id, index, title, reward }: { id: string; index: number; title: string; reward: number }) {
  return (
    <View
      accessibilityLabel={`${handwritten(title)}, done, ${reward} coins paid`}
      style={[styles.note, styles.noteDone, { backgroundColor: FRIDGE.papers[index % FRIDGE.papers.length], transform: [{ rotate: lean(index) }] }]}
      testID={`quest-row-${id}`}
    >
      <Text style={[styles.noteTitle, styles.noteDoneTitle]}>{handwritten(title)}</Text>
      <Text style={styles.paid}>{`+${reward} PAID`}</Text>
      <Text style={styles.tick}>✓</Text>
    </View>
  );
}

function Reward({ amount }: { amount: number }): ReactElement {
  return (
    <View style={styles.reward}>
      <CoinChip size={11} />
      <Text style={styles.rewardText}>{`+${amount}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: FRIDGE.enamel[2] },
  seam: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: FRIDGE.seam },
  handle: { position: "absolute", right: 9, width: 12, height: 300, borderRadius: 7 },

  hud: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: spacing.md,
    zIndex: 2,
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: FRIDGE.pill,
    borderWidth: 3,
    borderColor: ledger.goldEdge,
  },
  wallet: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 8 },
  pillText: { fontFamily: fonts.arcade, fontSize: 17, color: ledger.parchment, letterSpacing: 0.5 },

  content: { paddingLeft: 16, paddingRight: 30, gap: 14 },

  title: { flexDirection: "row", gap: 5, paddingTop: 4, paddingLeft: 2 },
  tile: {
    width: 36,
    height: 42,
    borderRadius: 7,
    backgroundColor: FRIDGE.tile[1],
    borderTopWidth: 2,
    borderTopColor: FRIDGE.tile[0],
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 4px 0 #000, 0 8px 9px rgba(0,0,0,0.3)",
  },
  tileLetter: { fontFamily: fonts.arcade, fontSize: 27, color: FRIDGE.tileInk },
  tileValue: { position: "absolute", right: 3, bottom: 1, fontFamily: fonts.rubikSemiBold, fontSize: 8, color: FRIDGE.tileInk },

  streak: { gap: 6 },
  streakRow: { flexDirection: "row", justifyContent: "space-between" },
  streakDay: { alignItems: "center", gap: 4 },
  magnet: { width: 38, height: 38, alignItems: "center", justifyContent: "center", boxShadow: "0 4px 6px rgba(0,0,0,0.3)", borderRadius: 19 },
  magnetToday: { transform: [{ translateY: -4 }, { scale: 1.08 }] },
  magnetDay: { position: "absolute", fontFamily: fonts.arcade, fontSize: 14, color: FRIDGE.ink },
  magnetReward: { fontFamily: fonts.hand, fontSize: 15, color: ledger.inkBody },
  streakLine: { fontFamily: fonts.rubikMedium, fontSize: 13, lineHeight: 18, color: ledger.ink, paddingLeft: 4 },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 16 },
  note: {
    width: "48%",
    minHeight: 138,
    paddingTop: 16,
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 2,
    boxShadow: "0 10px 12px -6px rgba(0,0,0,0.35)",
  },
  noteWide: { width: "100%", minHeight: 0, paddingBottom: 16 },
  noteMagnet: {
    position: "absolute",
    top: -8,
    alignSelf: "center",
    width: 22,
    height: 22,
    borderRadius: 11,
    boxShadow: "0 3px 4px rgba(0,0,0,0.35)",
  },
  noteTitle: { fontFamily: fonts.hand, fontSize: 21, lineHeight: 22, color: FRIDGE.ink },
  noteBody: { flex: 1, marginTop: 4, fontFamily: fonts.rubik, fontSize: 13, lineHeight: 18, color: FRIDGE.inkBody },
  noteFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  noteCount: { fontFamily: fonts.rubikSemiBold, fontSize: 13, color: FRIDGE.ink, fontVariant: ["tabular-nums"] },
  noteOnce: { fontFamily: fonts.rubikSemiBold, fontSize: 11, letterSpacing: 0.7, color: ledger.inkBody },
  bar: { height: 7, marginTop: 4, borderRadius: 4, backgroundColor: "rgba(42,34,16,0.14)" },
  barFill: { height: "100%", borderRadius: 4, backgroundColor: FRIDGE.ink },

  reward: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 2,
    paddingLeft: 4,
    paddingRight: 7,
    borderRadius: 999,
    backgroundColor: "rgba(58,34,16,0.1)",
  },
  rewardText: { fontFamily: fonts.arcade, fontSize: 13, color: "#6b3416" },

  doneRule: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  doneLabel: { fontFamily: fonts.arcade, fontSize: 15, letterSpacing: 1, color: "#6b3416" },
  doneDash: { flex: 1, borderTopWidth: 2, borderStyle: "dashed", borderColor: FRIDGE.seam },
  doneCount: { fontFamily: fonts.rubikMedium, fontSize: 13, color: ledger.inkBody },

  noteDone: { minHeight: 72, paddingTop: 10, paddingBottom: 8 },
  noteDoneTitle: { fontSize: 19, paddingRight: 30 },
  paid: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderWidth: 2,
    borderRadius: 4,
    borderColor: FRIDGE.paid,
    fontFamily: fonts.arcade,
    fontSize: 11,
    letterSpacing: 0.8,
    color: FRIDGE.paid,
    transform: [{ rotate: "-6deg" }],
  },
  tick: {
    position: "absolute",
    right: 6,
    top: -6,
    fontFamily: fonts.hand,
    fontSize: 46,
    color: FRIDGE.tick,
    transform: [{ rotate: "-10deg" }],
  },
});
