import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { colors } from "@/constants/theme";

import {
  fitFelt,
  fitTable,
  openBandCenter,
  placeSeatsOnFelt,
  type PixelSize,
  type SeatBounds,
} from "./table-fit";
import { placeSeatsInRoom } from "./room-fit";
import {
  computeTableLayout,
  dealerButtonAnchor,
  resolvePoint,
  type CommunityAnchor,
  type NormPoint,
  type SeatAnchor,
  type SeatCount,
  type TableLayout,
  type TableLayoutConfig,
} from "./table-layout";

export type { PixelSize };

/**
 * The resolved geometry shared with descendants. Child animations read this to
 * target stable pixel coordinates without measuring laid-out views.
 */
export interface TableLayoutContextValue {
  layout: TableLayout;
  /** Pixel size of the felt box (not the outer container). */
  size: PixelSize;
  /** Offset of the felt box within the outer container. */
  origin: { x: number; y: number };
  /** Resolve a normalized point to felt-box pixels. */
  resolve: (point: NormPoint) => { x: number; y: number };
  /** Resolve a normalized point to outer-container pixels. */
  resolveContainer: (point: NormPoint) => { x: number; y: number };
}

const TableLayoutContext = createContext<TableLayoutContextValue | null>(null);

/** Read the current table geometry from inside the table (e.g. for animations). */
export function useTableLayout(): TableLayoutContextValue {
  const value = useContext(TableLayoutContext);
  if (!value) {
    throw new Error("useTableLayout must be used within a <PokerTable>");
  }
  return value;
}

/** Metadata handed to every slot renderer. */
export interface SlotMeta {
  size: PixelSize;
  /** Width used to size chrome independently of a full-room seating surface. */
  appearanceWidth?: number;
  /** A responsive scale factor derived from felt size (phone ≈ 0.7, tablet ≈ 1.2). */
  scale: number;
}

export interface SeatSlot<TSeat> extends SlotMeta {
  anchor: SeatAnchor;
  /** How many seats the table has: a seat's layout can depend on how crowded the table is. */
  seatCount: SeatCount;
  seat: TSeat | null;
  isDealer: boolean;
}

export interface CommunitySlot<TCard> extends SlotMeta {
  anchor: CommunityAnchor;
  card: TCard | null;
}

export interface PokerTableProps<TSeat, TCard> {
  seatCount: SeatCount;
  /** Seat data indexed by seat index; missing/nullish entries render empty. */
  seats?: readonly (TSeat | null | undefined)[];
  /** Community cards by slot index; missing/nullish entries render empty. */
  community?: readonly (TCard | null | undefined)[];
  /** Seat index currently holding the dealer button, or null to hide it. */
  dealerSeat?: number | null;
  /** Geometry overrides (seat radius, community span, etc.). */
  layoutConfig?: Partial<Omit<TableLayoutConfig, "seatCount">>;
  /** Per-seat normalized point overrides, applied to `"room"` placement only. */
  seatPositionOverrides?: Readonly<Record<number, Partial<NormPoint>>>;
  /**
   * Chrome hanging over the room's top edge, in points — the header's tag row — which a
   * `"room"` placement keeps its seats below (`placeSeatsInRoom`). Absent means nothing hangs
   * there.
   */
  topChrome?: number;

  renderSeat: (slot: SeatSlot<TSeat>) => ReactNode;
  renderCommunity: (slot: CommunitySlot<TCard>) => ReactNode;
  renderPot?: (meta: SlotMeta) => ReactNode;
  renderDealerButton?: (meta: SlotMeta & { anchor: NormPoint }) => ReactNode;

  /** Overlay drawn above the felt; laid out box-none so seats stay tappable. */
  hud?: ReactNode;
  /** Drawn above the seats too, for a modal moment like the Power Draw; box-none like the hud. */
  overlay?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * The fullest reach of a seat's chrome around its anchor, for a felt `tableWidth` wide. With
   * it, the table fits the painting and the seats together and centres the pair, so seats that
   * scale with the felt are never clipped and never leave a lopsided margin. Without it, the
   * felt keeps `chromeInset` clear on every side instead.
   */
  seatBounds?: SeatBounds;
  /**
   * Without `seatBounds`: the space reserved around the felt for seat labels and badges. With
   * it: the gutter kept clear around the table and its seats (default 4).
   */
  chromeInset?: number;
  /**
   * Where the seats go, with `seatBounds`: `"rail"` (the default) centres each avatar on the seat
   * ring and fits the table and seats together, so labels may hang past the rail; `"felt"` slides
   * each seat inside the table — avatar on the felt, labels at most on the rail, bar the near
   * seat's, which may hang below it — so the table fills its room (`placeSeatsOnFelt`).
   */
  seatPlacement?: "rail" | "felt" | "room";
  /** Chrome size for a room surface whose seats spread independently of the table painting. */
  appearanceWidth?: number;
  testID?: string;
}

/** The gutter around the table and its seats when the seats report their own bounds. */
const SEAT_BOUNDS_GUTTER = 4;

/**
 * Presentational poker table. Owns no game state: seats, community cards, pot,
 * and dealer position all arrive as props and render through the supplied slot
 * renderers. Geometry is deterministic and exposed via context so overlays and
 * animations can target stable anchors.
 */
export function PokerTable<TSeat, TCard>({
  seatCount,
  seats,
  community,
  dealerSeat = null,
  layoutConfig,
  seatPositionOverrides,
  topChrome = 0,
  renderSeat,
  renderCommunity,
  renderPot,
  renderDealerButton,
  hud,
  overlay,
  style,
  seatBounds,
  chromeInset,
  seatPlacement = "rail",
  appearanceWidth,
  testID,
}: PokerTableProps<TSeat, TCard>) {
  const [box, setBox] = useState<PixelSize>({ width: 0, height: 0 });

  const ringLayout = useMemo(
    () => computeTableLayout({ seatCount, ...layoutConfig }),
    [seatCount, layoutConfig],
  );
  const onFelt = seatBounds != null && seatPlacement === "felt";
  const inRoom = seatBounds != null && seatPlacement === "room";

  const shortSide = Math.min(box.width, box.height);
  const inset = seatBounds
    ? (chromeInset ?? SEAT_BOUNDS_GUTTER)
    : (chromeInset ?? Math.max(14, Math.round(shortSide * 0.05)) + 8);
  const { size: felt, origin } = useMemo(
    () =>
      inRoom
        ? { size: box, origin: { x: 0, y: 0 } }
        : !seatBounds
        ? fitFelt(box, inset)
        : fitTable(
            box,
            ringLayout.seats,
            seatBounds,
            inset,
            seatCount,
            // Seats on the felt are placed for each width the fit tries: the near seat's labels
            // can hang below the table, and the fit makes room for them.
            onFelt
              ? (size) =>
                  placeSeatsOnFelt(
                    ringLayout.seats,
                    size,
                    seatBounds,
                    seatCount,
                  )
              : undefined,
          ),
    [box, inset, ringLayout.seats, seatBounds, onFelt, inRoom, seatCount],
  );
  const chromeWidth = appearanceWidth ?? felt.width;

  // Seats inside the table are placed for the felt's size, so their anchors follow the fit; the
  // layout everything reads (chip flights, the dealer button) carries the placed anchors.
  const layout = useMemo<TableLayout>(() => {
    if (inRoom && seatBounds) {
      return {
        ...ringLayout,
        seats: placeSeatsInRoom(ringLayout.seats, felt, seatBounds, chromeWidth, topChrome).map((anchor) => {
          const override = seatPositionOverrides?.[anchor.index];
          return override ? { ...anchor, ...override } : anchor;
        }),
      };
    }
    if (!onFelt || !seatBounds) return ringLayout;
    const placed = placeSeatsOnFelt(
      ringLayout.seats,
      felt,
      seatBounds,
      seatCount,
    );
    // The pot takes the middle of the gap the seats leave it, not a fixed height.
    const potY = openBandCenter(placed, felt, seatBounds, seatCount);
    return {
      ...ringLayout,
      seats: placed,
      pot: potY == null ? ringLayout.pot : { ...ringLayout.pot, y: potY },
    };
  }, [ringLayout, onFelt, inRoom, seatBounds, felt, seatCount, chromeWidth, seatPositionOverrides, topChrome]);

  const scale = felt.width > 0 ? felt.width / 640 : 1;

  const ctx = useMemo<TableLayoutContextValue>(() => {
    const resolve = (p: NormPoint) => resolvePoint(p, felt);
    return {
      layout,
      size: felt,
      origin,
      resolve,
      resolveContainer: (p) => {
        const r = resolve(p);
        return { x: r.x + origin.x, y: r.y + origin.y };
      },
    };
  }, [layout, felt, origin]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  const ready = felt.width > 0 && felt.height > 0;
  const meta: SlotMeta = { size: felt, appearanceWidth: chromeWidth, scale };

  return (
    <View style={[styles.container, style]} onLayout={onLayout} testID={testID}>
      {ready ? (
        <TableLayoutContext.Provider value={ctx}>
          {/* Anchored chrome lives in the felt coordinate space. */}
          <View
            pointerEvents="box-none"
            style={[
              styles.anchorLayer,
              {
                left: origin.x,
                top: origin.y,
                width: felt.width,
                height: felt.height,
              },
            ]}
          >
            {/* Pot */}
            {renderPot ? (
              <BoxedSlot point={ctx.resolve(layout.pot)} size={felt}>
                {renderPot(meta)}
              </BoxedSlot>
            ) : null}

            {/* Community cards */}
            {layout.community.map((anchor) => (
              <AnchoredSlot key={anchor.key} point={ctx.resolve(anchor)}>
                {renderCommunity({
                  ...meta,
                  anchor,
                  card: community?.[anchor.index] ?? null,
                })}
              </AnchoredSlot>
            ))}

            {/* Seats */}
            {layout.seats.map((anchor) => (
              <AnchoredSlot key={anchor.key} point={ctx.resolve(anchor)}>
                {renderSeat({
                  ...meta,
                  anchor,
                  seatCount,
                  seat: seats?.[anchor.index] ?? null,
                  isDealer: dealerSeat === anchor.index,
                })}
              </AnchoredSlot>
            ))}

            {/* Dealer button */}
            {renderDealerButton &&
            dealerSeat != null &&
            layout.seats[dealerSeat]
              ? (() => {
                  const anchor = dealerButtonAnchor(layout.seats[dealerSeat]);
                  return (
                    <AnchoredSlot point={ctx.resolve(anchor)}>
                      {renderDealerButton({ ...meta, anchor })}
                    </AnchoredSlot>
                  );
                })()
              : null}
          </View>

          {/* HUD overlay — above the felt, does not swallow seat taps. */}
          {hud ? (
            <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
              {hud}
            </View>
          ) : null}
          {overlay ? (
            <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]}>
              {overlay}
            </View>
          ) : null}
        </TableLayoutContext.Provider>
      ) : null}
    </View>
  );
}

/**
 * Centers its child on a pixel point. Zero-size + centered children means the
 * anchor stays put regardless of the child's measured size, so a seat growing
 * (chips, name) never nudges the anchor and never reflows its neighbours.
 */
function AnchoredSlot({
  point,
  children,
}: {
  point: { x: number; y: number };
  children: ReactNode;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { left: point.x, top: point.y }]}
    >
      {children}
    </View>
  );
}

/**
 * Centers its child on a pixel point like `AnchoredSlot`, but inside a real box: the largest
 * one centred on the point that stays on the felt. Android does not draw the pot's amount
 * spilling out of a zero-size anchor (STO-516), so the pot gets room of its own.
 */
function BoxedSlot({
  point,
  size,
  children,
}: {
  point: { x: number; y: number };
  size: { width: number; height: number };
  children: ReactNode;
}) {
  const halfWidth = Math.max(0, Math.min(point.x, size.width - point.x));
  const halfHeight = Math.max(0, Math.min(point.y, size.height - point.y));
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.box,
        {
          height: halfHeight * 2,
          left: point.x - halfWidth,
          top: point.y - halfHeight,
          width: halfWidth * 2,
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    overflow: "hidden",
  },
  anchorLayer: {
    position: "absolute",
    zIndex: 1,
  },
  // Above the seats' layer (and their status pills, which carry an elevation of their own).
  overlay: { elevation: 30, zIndex: 30 },
  anchor: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    width: 0,
    height: 0,
  },
});
