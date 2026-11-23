import type React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Chip, EASE_OUT, GoldPill, Headline } from "./parts";
import { C, F, clamp } from "./theme";

const usePop = (delay: number, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};
const useFade = (delay: number, len = 10) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [delay, delay + len], [0, 1], { ...clamp, easing: EASE_OUT });
};

/* ── Opening: chip, then wordmark, a breath apart; the whole mark drifts in slowly ── */
export const Logo: React.FC<{ delay: number; len: number }> = ({ delay, len }) => {
  const frame = useCurrentFrame();
  const chip = usePop(delay);
  const chipIn = useFade(delay);
  const mark = useFade(delay + 5, 12);
  const tag = useFade(delay + 16, 12);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 44,
        scale: interpolate(frame, [0, len], [1, 1.04]),
      }}
    >
      <Chip
        tone="gold"
        size={280}
        label="W"
        style={{
          opacity: chipIn,
          scale: interpolate(chip, [0, 1], [0.8, 1]),
          rotate: `${interpolate(chip, [0, 1], [-30, 0])}deg`,
        }}
      />
      <div
        style={{
          fontFamily: F.ui,
          fontWeight: 700,
          fontSize: 150,
          color: C.cream100,
          opacity: mark,
          translate: `0 ${interpolate(mark, [0, 1], [24, 0])}px`,
          filter: `blur(${(1 - mark) * 6}px)`,
          textShadow: "0 6px 0 rgba(0,0,0,.3)",
        }}
      >
        WordPoker
      </div>
      <Tagline size={62} style={{ marginTop: -24, opacity: tag, translate: `0 ${interpolate(tag, [0, 1], [16, 0])}px` }} />
    </AbsoluteFill>
  );
};

/** The trademarked line, "WordPoker: The best word takes the pot", set under the wordmark. */
const Tagline: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <div style={{ fontFamily: F.ui, fontWeight: 600, fontSize: size, color: C.gold100, textAlign: "center", textShadow: "0 4px 0 rgba(0,0,0,.3)", ...style }}>
    The best word takes the pot<sup style={{ fontSize: "0.45em", marginLeft: 4 }}>™</sup>
  </div>
);

/* ── End card ─────────────────────────────────────────────────── */
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  const chip = usePop(0);
  const chipIn = useFade(0);
  const btn = usePop(40, 16);
  const btnIn = useFade(40);
  const foot = useFade(52, 12);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40, padding: "0 90px" }}>
      <Chip
        tone="gold"
        size={190}
        label="W"
        style={{ opacity: chipIn, scale: interpolate(chip, [0, 1], [0.8, 1]), rotate: `${interpolate(chip, [0, 1], [-30, 0])}deg` }}
      />
      <div style={{ height: 20 }} />
      <Headline text="Bet the board." delay={8} size={128} />
      <Headline text="Spell the pot." delay={18} size={128} gold />
      <div style={{ height: 60 }} />
      <div style={{ scale: interpolate(btn, [0, 1], [0.9, 1]), opacity: btnIn }}>
        <GoldPill shine={interpolate(frame, [64, 92], [0, 1], { ...clamp, easing: EASE_OUT })}>Join the iOS beta</GoldPill>
      </div>
      <div
        style={{
          fontFamily: F.body,
          fontWeight: 500,
          fontSize: 44,
          color: C.textDim,
          opacity: foot,
          translate: `0 ${(1 - foot) * 12}px`,
          textAlign: "center",
        }}
      >
        Now on TestFlight · Play at <span style={{ color: C.cream100, fontWeight: 700 }}>wordpoker.app</span>
      </div>
    </AbsoluteFill>
  );
};

/* ── Outro: the wordmark, the trademarked line and the site, nothing else ── */
export const Outro: React.FC = () => {
  const mark = useFade(0, 12);
  const tag = useFade(10, 12);
  const url = useFade(22, 12);
  const rise = (t: number) => ({ opacity: t, translate: `0 ${(1 - t) * 16}px` });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          fontFamily: F.ui,
          fontWeight: 700,
          fontSize: 170,
          color: C.cream100,
          textShadow: "0 6px 0 rgba(0,0,0,.3)",
          filter: `blur(${(1 - mark) * 6}px)`,
          ...rise(mark),
        }}
      >
        WordPoker
      </div>
      <Tagline size={66} style={rise(tag)} />
      <div style={{ fontFamily: F.body, fontWeight: 700, fontSize: 52, color: C.cream100, marginTop: 50, ...rise(url) }}>wordpoker.app</div>
    </AbsoluteFill>
  );
};
