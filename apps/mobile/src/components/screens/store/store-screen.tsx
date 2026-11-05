/**
 * store-screen.tsx — the ♦ STORE tab (STO-1045, design 1a): coin packs and tile sets.
 *
 * A tab drawn over the mounted home street, so it dims the street and keeps the same HUD on top:
 * the HUD's coin pill is the one balance the app shows (`useQuests().coins`). Both tabs open with
 * the daily bonus. COINS sells RevenueCat packs through `useCoinStore`; TILES buys and equips sets
 * through `useTileSets`. Every purchase goes through the confirm sheet; a toast confirms it.
 */

import { Host } from "@expo/ui";
import { LinearGradient } from "expo-linear-gradient";
import { isAccountEligible, TILE_SET_PRICES, type TileSetId } from "@wordpoker/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { authClient } from "@/auth/client/auth-client";
import { FELT } from "@/components/screens/home/account-card";
import { HomeHeader, homeHeaderTop } from "@/components/screens/home/home-header";
import { HOME_NAV_RACK_OVERLAP } from "@/components/screens/home/home-nav-rack";
import { VerifyEmailCard } from "@/components/ui/verify-email-card";
import { colors, fonts, layout, ledger, spacing } from "@/constants/theme";
import { useQuests } from "@/lib/quests/quests-provider";
import { useTileSets } from "@/lib/tile-sets/tile-sets-provider";
import { formatCoins } from "@/lib/ui/format";

import type { CoinPackRow } from "./coin-packs";
import { CoinPackGrid } from "./components/coin-pack-grid";
import { ConfirmSheet, PackPreview, tileSetLine } from "./components/confirm-sheet";
import { DailyBonusCard } from "./components/daily-bonus-card";
import { STORE } from "./components/store-art";
import { TILE_SET_COPY, TileSetList, TilePreview } from "./components/tile-set-list";
import { useCoinStore } from "./use-coin-store";
import { useDailyBonus } from "./use-daily-bonus";

type StoreTab = "coins" | "tiles";

const CLEAR = ["transparent", "transparent"] as const;
type Sheet = { readonly kind: "tile"; readonly set: TileSetId } | { readonly kind: "pack"; readonly row: CoinPackRow };

const TOAST_MS = 1700;
/** The HUD row's height, so the title starts under it. */
const HUD_HEIGHT = 48;

function useToast() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string) => {
    clearTimeout(timer.current);
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text }));
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, show };
}

export function StoreScreen() {
  const insets = useSafeAreaInsets();
  const windowHeight = useWindowDimensions().height;
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const store = useCoinStore(user?.id);
  const { coins, refreshCoins } = useQuests();
  const tileSets = useTileSets();
  const { toast, show } = useToast();
  const daily = useDailyBonus(useCallback((reward: number) => show(`+${formatCoins(reward)} DAILY BONUS`), [show]));

  const [width, setWidth] = useState(0);
  const [tab, setTab] = useState<StoreTab>("coins");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const open = (next: Sheet) => {
    setSheetError(null);
    setSheet(next);
  };
  const close = () => {
    setSheet(null);
    setSheetError(null);
  };

  // A pack's landing closes the sheet and re-reads the HUD's balance, which bumps the coin pill.
  const buyPack = async (row: CoinPackRow) => {
    setSheetError(null);
    const notice = await store.buy(row);
    if (!notice) return;
    if (notice.kind === "error") {
      setSheetError(notice.message);
      return;
    }
    show(notice.kind === "added" ? `+${formatCoins(notice.coins)} COINS` : "COINS ON THE WAY");
    void refreshCoins();
    setSheet(null);
  };

  const buyTileSet = async (set: TileSetId) => {
    setBusy(true);
    setSheetError(null);
    try {
      const result = await tileSets.buy(set);
      if (result.ok) {
        show(`${TILE_SET_COPY[set].name.toUpperCase()} TILES EQUIPPED`);
        void refreshCoins();
        setSheet(null);
      } else if (result.reason === "insufficient_coins") {
        // The balance moved under the sheet: re-read it, and the line turns to "You need…".
        void refreshCoins();
      } else if (result.reason === "pending") {
        show("PURCHASE PENDING");
        setSheet(null);
      } else {
        setSheetError(result.message);
      }
    } catch {
      setSheetError("Couldn’t buy that set. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const equip = async (set: TileSetId) => {
    show(`${TILE_SET_COPY[set].name.toUpperCase()} TILES EQUIPPED`);
    try {
      const result = await tileSets.equip(set);
      if (!result.ok) show(result.message.toUpperCase());
    } catch {
      show("COULDN’T EQUIP. TRY AGAIN.");
    }
  };

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => setWidth(nativeEvent.layout.width);
  const headerTop = homeHeaderTop(insets.top, windowHeight);
  const signedOut = store.balance.status === "signed-out";
  const owned = tileSets.state?.owned ?? [tileSets.equipped];
  const packIndex = (row: CoinPackRow) => (store.packs.status === "ready" ? Math.max(0, store.packs.rows.indexOf(row)) : 0);

  return (
    <View onLayout={onLayout} style={styles.root} testID="store-screen">
      {width > 0 ? (
        <View style={[styles.header, { top: headerTop }]}>
          <HomeHeader width={width - spacing.gutter * 2} />
        </View>
      ) : null}

      <View style={[styles.top, { paddingTop: headerTop + HUD_HEIGHT + 12 }]}>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.title}>STORE</Text>
          <Text style={styles.subtitle}>Coins buy tile sets</Text>
        </View>
        <View accessibilityRole="tablist" style={styles.switch}>
          {(["coins", "tiles"] as const).map((key) => {
            const selected = tab === key;

            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                key={key}
                onPress={() => setTab(key)}
                style={styles.switchCell}
                testID={`store-tab-${key}`}
              >
                <LinearGradient colors={selected ? ledger.goldButton : CLEAR} style={[styles.switchTab, selected && styles.switchTabOn]}>
                  <Text style={[styles.switchLabel, selected && styles.switchLabelOn]}>{key.toUpperCase()}</Text>
                </LinearGradient>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: HOME_NAV_RACK_OVERLAP + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <DailyBonusCard bonus={daily.bonus} onClaim={daily.claim} />

        {signedOut ? (
          <Text style={styles.body} testID="store-signed-out">Sign in to buy coins and tile sets.</Text>
        ) : store.balance.status === "error" ? (
          <Text style={styles.error} testID="wallet-error">{store.balance.message}</Text>
        ) : null}

        {user && !user.isAnonymous && !isAccountEligible(user) && store.balance.status === "ready" && !store.balance.welcomed ? (
          <Host colorScheme="dark" matchContents={{ vertical: true }} seedColor={colors.gold} style={{ width: "100%" }}>
            <VerifyEmailCard email={user.email} testID="store-verify" />
          </Host>
        ) : null}

        {tab === "coins" ? (
          signedOut ? null : store.packs.status === "unavailable" ? (
            <Text style={styles.body} testID="store-unavailable">Coin packs are available in the mobile app.</Text>
          ) : store.packs.status === "loading" ? (
            <Text style={styles.body}>Opening the store…</Text>
          ) : store.packs.status === "error" ? (
            <Text style={styles.error} testID="store-packs-error">{store.packs.message}</Text>
          ) : (
            <CoinPackGrid
              buying={store.buying}
              disabled={!store.canBuy || store.buying !== null}
              onSelect={(row) => open({ kind: "pack", row })}
              rows={store.packs.rows}
            />
          )
        ) : (
          <TileSetList
            equipped={tileSets.equipped}
            onBuy={(set) => open({ kind: "tile", set })}
            onEquip={(set) => void equip(set)}
            owned={owned}
          />
        )}
      </ScrollView>

      {toast ? (
        <Animated.View
          entering={FadeInUp.springify().damping(14)}
          exiting={FadeOut.duration(200)}
          key={toast.id}
          pointerEvents="none"
          style={[styles.toastSlot, { top: headerTop + HUD_HEIGHT + 16 }]}
        >
          <View style={styles.toast}>
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.toastLabel} testID="store-toast">{toast.text}</Text>
          </View>
        </Animated.View>
      ) : null}

      {sheet?.kind === "tile" ? (
        <TileSetSheet
          busy={busy}
          coins={coins}
          error={sheetError}
          onBuy={() => void buyTileSet(sheet.set)}
          onCancel={close}
          onGetCoins={() => {
            close();
            setTab("coins");
          }}
          set={sheet.set}
        />
      ) : sheet?.kind === "pack" ? (
        <ConfirmSheet
          action={{
            label: `BUY · ${sheet.row.priceString}`,
            accessibilityLabel: `Buy for ${sheet.row.priceString}`,
            onPress: () => void buyPack(sheet.row),
          }}
          busy={store.buying === sheet.row.productId}
          error={sheetError}
          line={{ text: sheet.row.bonusPercent > 0 ? `Includes a ${sheet.row.bonusPercent}% bonus.` : "Coins land in your wallet." }}
          onCancel={close}
          preview={<PackPreview index={packIndex(sheet.row)} />}
          title={`${formatCoins(sheet.row.coins)} coins`}
        />
      ) : null}
    </View>
  );
}

function TileSetSheet({
  set,
  coins,
  busy,
  error,
  onBuy,
  onGetCoins,
  onCancel,
}: {
  set: TileSetId;
  coins: number | null;
  busy: boolean;
  error: string | null;
  onBuy: () => void;
  onGetCoins: () => void;
  onCancel: () => void;
}) {
  const price = TILE_SET_PRICES[set];
  const line = tileSetLine(price, coins);
  const short = line.tone === "short";

  return (
    <ConfirmSheet
      action={
        short
          ? { label: "GET COINS", accessibilityLabel: "Get coins", onPress: onGetCoins }
          : { label: `BUY · ${formatCoins(price)}`, accessibilityLabel: `Buy for ${formatCoins(price)} coins`, onPress: onBuy }
      }
      busy={busy}
      error={error}
      line={line}
      onCancel={onCancel}
      preview={<TilePreview gap={5} scale={1.1} set={set} tilt word="POKER" />}
      title={`${TILE_SET_COPY[set].name} tiles`}
    />
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: "rgba(4, 6, 14, 0.82)", flex: 1 },
  header: { left: spacing.gutter, position: "absolute", right: spacing.gutter, zIndex: 2 },
  top: { alignSelf: "center", maxWidth: layout.maxContentWidth, paddingHorizontal: 20, width: "100%" },
  titleRow: { alignItems: "flex-end", flexDirection: "row", gap: 10, justifyContent: "space-between", paddingBottom: 12, paddingTop: 4 },
  title: {
    color: STORE.cream,
    fontFamily: fonts.arcade,
    fontSize: 34,
    letterSpacing: 1,
    lineHeight: 36,
    textShadowColor: STORE.lip,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  subtitle: { color: STORE.mute, fontFamily: fonts.rubikMedium, fontSize: 12, lineHeight: 16, textAlign: "right" },
  switch: {
    backgroundColor: STORE.navy,
    borderColor: "rgba(224, 151, 74, 0.6)",
    borderRadius: 14,
    borderWidth: 2,
    flexDirection: "row",
    gap: 4,
    padding: 4,
  },
  switchCell: { flex: 1 },
  switchTab: { alignItems: "center", borderRadius: 10, height: 38, justifyContent: "center" },
  switchTabOn: { boxShadow: "0px 3px 0px #9a5f1c" },
  switchLabel: { color: STORE.tagEdge, fontFamily: fonts.arcade, fontSize: 16, letterSpacing: 0.8 },
  switchLabelOn: { color: STORE.darkInk },
  content: { alignSelf: "center", gap: 14, maxWidth: layout.maxContentWidth, paddingHorizontal: 20, paddingTop: 14, width: "100%" },
  body: { color: STORE.cream, fontFamily: fonts.rubik, fontSize: 14, textAlign: "center" },
  error: { color: STORE.short, fontFamily: fonts.rubik, fontSize: 14, textAlign: "center" },
  toastSlot: { alignItems: "center", left: 0, position: "absolute", right: 0, zIndex: 3 },
  toast: {
    backgroundColor: FELT.face,
    borderColor: FELT.edge,
    borderRadius: 999,
    borderWidth: 2,
    boxShadow: "0px 6px 14px rgba(0, 0, 0, 0.45)",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  toastLabel: { color: FELT.ink, fontFamily: fonts.arcade, fontSize: 14, letterSpacing: 0.7 },
});
