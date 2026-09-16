import {
  Column,
  Host,
  Row,
  Text,
  type UniversalStyle,
  type UniversalTextStyle,
} from "@expo/ui";

import { border, colors, fonts, fontSize, radius } from "@/constants/theme";
import type {
  CommunitySlot,
  PokerTableProps,
  SeatSlot,
  SlotMeta,
} from "./poker-table";
import type { NormPoint } from "./table-layout";

/** Action/turn state a seat can advertise on its nameplate. */
export type SeatStatus =
  | "waiting"
  | "yourturn"
  | "call"
  | "raise"
  | "check"
  | "fold"
  | "winner";

/** Default seat model the built-in renderer understands. */
export interface SeatData {
  name: string;
  /** Emoji/initials shown in the avatar puck. Defaults to the name's initials. */
  glyph?: string;
  chips?: number;
  folded?: boolean;
  /** Highlights the seat whose turn it is. */
  active?: boolean;
  /** Nameplate status pill. Overrides the folded/active-derived default. */
  status?: SeatStatus;
  /** Avatar colour; defaults to the theme player wheel by seat index. */
  color?: string;
}

const STATUS_META: Record<SeatStatus, { color: string; label: string }> = {
  waiting: { color: colors.success, label: "WAITING" },
  yourturn: { color: colors.gold, label: "YOUR TURN" },
  call: { color: colors.info, label: "CALL" },
  raise: { color: colors.warning, label: "RAISE" },
  check: { color: colors.success, label: "CHECK" },
  fold: { color: colors.textFaint, label: "FOLD" },
  winner: { color: colors.goldHi, label: "WINNER" },
};

function resolveStatus(seat: SeatData): SeatStatus {
  if (seat.status) return seat.status;
  if (seat.folded) return "fold";
  if (seat.active) return "yourturn";
  return "waiting";
}

export type Suit = "spade" | "heart" | "diamond" | "club";

/** Default community-card model. `faceDown` renders the card back. */
export interface CommunityCardData {
  rank?: string;
  suit?: Suit;
  faceDown?: boolean;
}

const SUIT_GLYPH: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  diamond: "♦",
  club: "♣",
};

const RED_SUITS: ReadonlySet<Suit> = new Set<Suit>(["heart", "diamond"]);

/** Per-seat avatar colours, cycled by seat index. */
const PLAYER_COLORS = colors.players;

/** px, rounded, floored at a legible minimum on small phones. */
function px(base: number, scale: number, min: number) {
  return Math.max(min, Math.round(base * scale));
}

/* ── seat ─────────────────────────────────────────────────────────── */

export function DefaultSeat({ seat, anchor, scale }: SeatSlot<SeatData>) {
  const puck = px(56, scale, 42);
  const containerWidth = px(100, scale, 74);

  if (!seat) {
    const emptyPuck: UniversalStyle = {
      width: puck,
      height: puck,
      borderRadius: radius.pill,
      borderWidth: border.thin,
      borderColor: colors.borderFaint,
      backgroundColor: colors.surface,
    };
    return (
      <Host matchContents>
        <Column alignment="center" spacing={4} style={{ width: containerWidth }}>
          <Row alignment="center" style={emptyPuck} />
          <Text textStyle={emptyLabel}>OPEN</Text>
        </Column>
      </Host>
    );
  }

  const status = resolveStatus(seat);
  const meta = STATUS_META[status];
  const lit = status === "yourturn" || status === "winner";
  const avatarColor = seat.color ?? PLAYER_COLORS[anchor.index % PLAYER_COLORS.length];

  const puckStyle: UniversalStyle = {
    width: puck,
    height: puck,
    borderRadius: radius.pill,
    borderWidth: lit ? border.thick : border.thin,
    borderColor: lit ? meta.color : colors.bg,
    backgroundColor: avatarColor,
    opacity: status === "fold" ? 0.45 : 1,
  };

  const pill: UniversalStyle = {
    backgroundColor: lit ? meta.color : colors.surfaceStrong,
    borderRadius: radius.xs,
    borderWidth: lit ? 0 : border.hairline,
    borderColor: meta.color,
    paddingHorizontal: 8,
    paddingVertical: 2,
  };

  return (
    <Host matchContents>
      <Column alignment="center" spacing={4} style={{ width: containerWidth }}>
        <Row alignment="center" style={puckStyle}>
          <Text textStyle={{ ...avatarInk, fontSize: px(20, scale, 15) }}>
            {seat.glyph ?? initials(seat.name)}
          </Text>
        </Row>
        <Text textStyle={nameLabel}>{seat.name.toUpperCase()}</Text>
        <Row alignment="center" style={pill}>
          <Text textStyle={{ ...pillText, color: lit ? colors.onGold : meta.color }}>
            {meta.label}
          </Text>
        </Row>
        {seat.chips != null ? (
          <Text textStyle={chipLabel}>{`$${seat.chips.toLocaleString()}`}</Text>
        ) : null}
      </Column>
    </Host>
  );
}

/** Two-letter initials from a display name ("Mira Quill" → "MQ", "Ben" → "BE"). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length > 1) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/* ── community card ───────────────────────────────────────────────── */

export function DefaultCommunityCard({ card, scale }: CommunitySlot<CommunityCardData>) {
  const w = px(44, scale, 30);
  const h = px(62, scale, 42);

  if (!card) {
    return <Host matchContents>{emptyCard(w, h)}</Host>;
  }

  if (card.faceDown) {
    return <Host matchContents>{cardBack(w, h)}</Host>;
  }

  const isRed = card.suit ? RED_SUITS.has(card.suit) : false;
  const ink = isRed ? colors.danger : colors.onTile;
  const face: UniversalStyle = {
    width: w,
    height: h,
    borderRadius: radius.tile,
    backgroundColor: colors.textBright,
    paddingVertical: 4,
    paddingHorizontal: 4,
  };

  return (
    <Host matchContents>
      <Column alignment="center" spacing={0} style={face}>
        <Text textStyle={{ ...cardRank, color: ink, fontSize: px(18, scale, 13) }}>
          {card.rank ?? "?"}
        </Text>
        {card.suit ? (
          <Text textStyle={{ ...cardSuit, color: ink, fontSize: px(20, scale, 14) }}>
            {SUIT_GLYPH[card.suit]}
          </Text>
        ) : null}
      </Column>
    </Host>
  );
}

function emptyCard(w: number, h: number) {
  const style: UniversalStyle = {
    width: w,
    height: h,
    borderRadius: radius.tile,
    borderWidth: border.thin,
    borderColor: colors.borderFaint,
    backgroundColor: colors.surface,
  };
  return <Row alignment="center" style={style} />;
}

function cardBack(w: number, h: number) {
  const style: UniversalStyle = {
    width: w,
    height: h,
    borderRadius: radius.tile,
    borderWidth: border.thin,
    borderColor: colors.borderStrong,
    backgroundColor: colors.goldDeep,
  };
  return <Row alignment="center" style={style} />;
}

/* ── pot ──────────────────────────────────────────────────────────── */

export function DefaultPot(amount: number | null | undefined) {
  return function PotRenderer({ scale }: SlotMeta) {
    if (amount == null) return null;
    return (
      <Host matchContents>
        <Column alignment="center" spacing={2}>
          <Text textStyle={potLabelText}>POT</Text>
          <Text textStyle={{ ...potAmountText, fontSize: px(28, scale, 20) }}>
            {`$${amount.toLocaleString()}`}
          </Text>
        </Column>
      </Host>
    );
  };
}

/* ── dealer button ────────────────────────────────────────────────── */

export function DefaultDealerButton({ scale }: SlotMeta & { anchor: NormPoint }) {
  const d = px(26, scale, 20);
  const style: UniversalStyle = {
    width: d,
    height: d,
    borderRadius: radius.pill,
    backgroundColor: colors.goldHi,
    borderWidth: border.thin,
    borderColor: colors.goldDeep,
  };
  return (
    <Host matchContents>
      <Row alignment="center" style={style}>
        <Text textStyle={{ ...dealerText, fontSize: px(13, scale, 11) }}>D</Text>
      </Row>
    </Host>
  );
}

/* ── convenience: a fully-defaulted table prop set ────────────────── */

/**
 * Wire the built-in renderers into `PokerTable`. Spread the result:
 * `<PokerTable {...defaultTableRenderers(pot)} seatCount={6} seats={...} />`.
 */
export function defaultTableRenderers(
  pot?: number | null,
): Pick<
  PokerTableProps<SeatData, CommunityCardData>,
  "renderSeat" | "renderCommunity" | "renderPot" | "renderDealerButton"
> {
  return {
    renderSeat: DefaultSeat,
    renderCommunity: DefaultCommunityCard,
    renderPot: pot == null ? undefined : DefaultPot(pot),
    renderDealerButton: DefaultDealerButton,
  };
}

/* ── text styles ──────────────────────────────────────────────────── */

const avatarInk: UniversalTextStyle = {
  // Dark ink reads on the bright player-wheel colours.
  color: colors.onGold,
  fontFamily: fonts.sansBlack,
};
const nameLabel: UniversalTextStyle = {
  color: colors.textBright,
  fontFamily: fonts.mono,
  fontSize: fontSize.micro,
  letterSpacing: 1.2,
};
const pillText: UniversalTextStyle = {
  fontFamily: fonts.monoBold,
  fontSize: fontSize.micro,
  letterSpacing: 1.2,
};
const chipLabel: UniversalTextStyle = {
  color: colors.gold,
  fontFamily: fonts.serifBold,
  fontSize: fontSize.small,
};
const emptyLabel: UniversalTextStyle = {
  color: colors.textFaint,
  fontFamily: fonts.mono,
  fontSize: fontSize.micro,
  letterSpacing: 1.5,
};
const cardRank: UniversalTextStyle = { fontFamily: fonts.serifBold };
const cardSuit: UniversalTextStyle = { fontFamily: fonts.sans };
const potLabelText: UniversalTextStyle = {
  color: colors.textDim,
  fontFamily: fonts.mono,
  fontSize: fontSize.micro,
  letterSpacing: 2,
};
const potAmountText: UniversalTextStyle = {
  color: colors.gold,
  fontFamily: fonts.serifBold,
};
const dealerText: UniversalTextStyle = {
  color: colors.onGold,
  fontFamily: fonts.sansBlack,
};
