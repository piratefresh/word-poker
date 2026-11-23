import { Audio } from "@remotion/media";
import type React from "react";
import { AbsoluteFill, Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, CHIPS, F, VALUES, clamp, type ChipTone } from "./theme";

/** An ivory tile. `flip` 0 shows the red back, 1 the face. */
export const Tile: React.FC<{
  letter: string;
  size: number;
  flip?: number;
  lit?: number;
  dim?: number;
  style?: React.CSSProperties;
}> = ({ letter, size, flip = 1, lit = 0, dim = 0, style }) => {
  const deg = interpolate(flip, [0, 1], [180, 0]);
  const r = size * 0.11;
  const common: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: r,
    backfaceVisibility: "hidden",
  };
  return (
    <div style={{ width: size, height: size, position: "relative", perspective: size * 6, flex: "none", ...style }}>
      <div
        style={{
          ...common,
          transform: `rotateY(${deg - 180}deg)`,
          background: "repeating-linear-gradient(45deg, #7a1d18 0 14px, #8e2620 14px 28px)",
          boxShadow: `inset 0 0 0 ${size * 0.05}px #e9d4a8, inset 0 0 0 ${size * 0.065}px #5e1210, 0 ${size * 0.05}px 0 #3e0c0a, 0 ${size * 0.1}px ${size * 0.14}px rgba(0,0,0,.5)`,
        }}
      />
      <div
        style={{
          ...common,
          transform: `rotateY(${deg}deg)`,
          background: `linear-gradient(135deg, ${C.tileHi}, ${C.tileLo})`,
          boxShadow: [
            "inset 0 2px 0 #fff",
            `inset 0 -${size * 0.04}px 0 rgba(120,80,30,.25)`,
            `0 ${size * 0.05}px 0 ${C.tileEdge}`,
            `0 ${size * 0.1}px ${size * 0.14}px rgba(0,0,0,.5)`,
            `0 0 0 ${lit * size * 0.04}px ${C.gold200}`,
            `0 0 ${lit * size * 0.35}px rgba(247,223,122,${0.6 * lit})`,
          ].join(", "),
          filter: `saturate(${1 - dim * 0.5}) brightness(${1 - dim * 0.35})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.tileInk,
        }}
      >
        <span style={{ fontFamily: F.tile, fontSize: size * 0.58, lineHeight: 1, marginTop: -size * 0.02 }}>{letter}</span>
        <span style={{ position: "absolute", right: size * 0.08, bottom: size * 0.05, fontFamily: F.tile, fontSize: size * 0.22, lineHeight: 1 }}>
          {VALUES[letter]}
        </span>
      </div>
    </div>
  );
};

/** A painted poker chip, lit from the top left. */
export const Chip: React.FC<{ tone: ChipTone; size: number; label?: string; style?: React.CSSProperties }> = ({
  tone,
  size,
  label,
  style,
}) => {
  const t = CHIPS[tone];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flex: "none",
        background: `repeating-conic-gradient(${t.inset} 0 14deg, ${t.base} 14deg 45deg)`,
        boxShadow: `0 ${size * 0.06}px 0 ${t.dark}, 0 ${size * 0.12}px ${size * 0.2}px rgba(0,0,0,.5)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        style={{
          width: "72%",
          height: "72%",
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${t.light}, ${t.base} 60%, ${t.dark})`,
          boxShadow: `inset 0 0 0 ${size * 0.025}px ${t.ring}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: F.tile,
          fontSize: size * 0.3,
          color: tone === "gold" ? "#3a2a12" : t.ring,
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** The felt the whole trailer sits on, with slow drifting tiles behind the action. */
export const Felt: React.FC = () => {
  const frame = useCurrentFrame();
  const { height } = useVideoConfig();
  const drift: Array<[string, number, number, number, number, number]> = [
    ["Q", 90, 300, 150, 18, 0.5],
    ["E", 860, 180, 120, -12, 0.7],
    ["K", 760, 1050, 170, 9, 0.4],
    ["A", 60, 1400, 130, -20, 0.6],
    ["Z", 900, 1650, 110, 24, 0.8],
    ["S", 380, 1850, 140, -6, 0.45],
    ["J", 470, 620, 100, 14, 0.9],
  ];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 70% at 50% 18%, ${C.felt400} 0%, ${C.felt500} 40%, ${C.felt600} 75%, ${C.felt800} 100%)`,
      }}
    >
      {drift.map(([l, x, y, s, rot, speed]) => (
        <div
          key={l}
          style={{
            position: "absolute",
            left: x,
            top: ((y - frame * speed) % (height + 300) + height + 300) % (height + 300) - 200,
            rotate: `${rot + frame * speed * 0.08}deg`,
            opacity: 0.1,
            filter: "blur(3px)",
          }}
        >
          <Tile letter={l} size={s} />
        </div>
      ))}
      <AbsoluteFill style={{ background: "radial-gradient(100% 60% at 50% 50%, transparent 55%, rgba(0,0,0,.55))" }} />
    </AbsoluteFill>
  );
};

/** Words that rise into place one after another. */
export const Headline: React.FC<{
  text: string;
  delay?: number;
  size?: number;
  color?: string;
  gold?: boolean;
  style?: React.CSSProperties;
}> = ({ text, delay = 0, size = 110, color = C.cream100, gold = false, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        columnGap: size * 0.26,
        fontFamily: F.ui,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.05,
        textAlign: "center",
        ...style,
      }}
    >
      {text.split(" ").map((w, i) => {
        const p = spring({ frame: frame - delay - i * 2, fps, config: { damping: 18, mass: 0.7 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: interpolate(p, [0, 0.6], [0, 1], clamp),
              translate: `0 ${interpolate(p, [0, 1], [size * 0.3, 0])}px`,
              color,
              textShadow: gold ? undefined : "0 5px 0 rgba(0,0,0,.28)",
              ...(gold
                ? {
                    backgroundImage: `linear-gradient(180deg, ${C.gold100}, ${C.gold300} 60%, ${C.gold500})`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 5px 0 rgba(0,0,0,.3))",
                  }
                : null),
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Strong ease-out: moves at once, settles softly. Exits use it too, just shorter. */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** 0→1 over `len` frames from `start`, on the strong ease-out. */
const ramp = (frame: number, start: number, len: number) =>
  interpolate(frame, [start, start + len], [0, 1], { ...clamp, easing: EASE_OUT });

const POP_TONES = {
  gold: { bg: `linear-gradient(135deg, ${C.gold100}, ${C.gold300} 55%, ${C.gold500})`, ink: C.onGold, edge: C.gold600 },
  purple: { bg: "linear-gradient(135deg, #c3a6f5, #8559cc 55%, #5b3690)", ink: "#fff", edge: "#2c1848" },
} as const;

/**
 * A score pop-up over the footage, with its sound. It rises from 0.85 with opacity and a little
 * blur (never from nothing), settles with a soft bounce, and leaves in 5 frames: faster than it came.
 * A soft scrim behind it keeps it legible over busy gameplay.
 */
export const Pop: React.FC<{
  len: number;
  top: number;
  size?: number;
  tilt?: number;
  tone?: keyof typeof POP_TONES;
  sfx?: string;
  children: React.ReactNode;
}> = ({ len, top, size = 150, tilt = -3, tone = "gold", sfx, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = POP_TONES[tone];
  const inn = ramp(frame, 0, 9);
  const settle = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const out = ramp(frame, len - 5, 5);
  const shown = inn * (1 - out);
  return (
    <AbsoluteFill>
      {sfx ? <Audio src={staticFile(`sfx/${sfx}.mp3`)} volume={0.55} /> : null}
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% ${size * 1.6}px at 50% ${top + size * 0.6}px, rgba(4,14,10,.55), transparent)`,
          opacity: shown,
        }}
      />
      <AbsoluteFill style={{ top, bottom: "auto", alignItems: "center" }}>
        <div
          style={{
            fontFamily: F.tile,
            fontSize: size,
            lineHeight: 1,
            whiteSpace: "nowrap",
            color: t.ink,
            background: t.bg,
            borderRadius: 999,
            padding: `${size * 0.16}px ${size * 0.4}px ${size * 0.08}px`,
            boxShadow: `inset 0 3px 0 rgba(255,255,255,.55), 0 ${size * 0.06}px 0 ${t.edge}, 0 ${size * 0.16}px ${size * 0.32}px rgba(0,0,0,.5)`,
            opacity: shown,
            filter: `blur(${(1 - inn) * 6 + out * 4}px)`,
            translate: `0 ${(1 - inn) * size * 0.2}px`,
            rotate: `${tilt}deg`,
            scale: interpolate(settle, [0, 1], [0.85, 1]) * (1 - out * 0.06),
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Letter tiles that land one by one (`at` = frame per tile), then light up together. */
export const TileRow: React.FC<{ letters: string; at: number[]; len: number; top: number; size: number }> = ({
  letters,
  at,
  len,
  top,
  size,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const done = at[at.length - 1] + 6;
  const out = ramp(frame, len - 5, 5);
  return (
    <AbsoluteFill
      style={{
        top,
        bottom: "auto",
        flexDirection: "row",
        justifyContent: "center",
        gap: size * 0.1,
        opacity: 1 - out,
        filter: `blur(${out * 4}px)`,
        scale: 1 - out * 0.06,
      }}
    >
      {[...letters].map((l, i) => {
        const p = spring({ frame: frame - at[i], fps, config: { damping: 15, mass: 0.7 } });
        const inn = ramp(frame, at[i], 7);
        return (
          <div key={i}>
            <Audio from={at[i]} src={staticFile("sfx/tile.mp3")} volume={0.7} />
            <Tile
              letter={l}
              size={size}
              flip={p}
              lit={ramp(frame, done, 8)}
              style={{
                opacity: inn,
                translate: `0 ${interpolate(p, [0, 1], [-size * 0.45, 0])}px`,
                scale: interpolate(p, [0, 1], [0.9, 1]),
                rotate: `${(i % 2 ? 3 : -3) * (1 - p)}deg`,
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};


/** The gold primary, as GoldButton draws it. */
export const GoldPill: React.FC<{ children: React.ReactNode; shine: number; style?: React.CSSProperties }> = ({
  children,
  shine,
  style,
}) => (
  <div
    style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: 999,
      padding: "34px 70px 30px",
      fontFamily: F.ui,
      fontWeight: 700,
      fontSize: 58,
      color: C.onGold,
      background: `linear-gradient(135deg, ${C.gold200}, ${C.gold300} 50%, ${C.gold500})`,
      boxShadow: `inset 0 2px 0 rgba(255,246,210,.75), inset 0 -4px 0 rgba(90,60,10,.35), 0 10px 0 ${C.gold600}, 0 24px 40px rgba(0,0,0,.45)`,
      ...style,
    }}
  >
    {children}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(110deg, transparent 35%, rgba(255,255,255,.55) 50%, transparent 65%)",
        translate: `${interpolate(shine, [0, 1], [-120, 120])}% 0`,
      }}
    />
  </div>
);

/**
 * HEMP added up tile by tile, each tile landing as Ellis names it (`at`, frames), its points
 * underneath; the E wears the 2× badge and reads "1 × 2 = 2". The total pill lands at `total`.
 */
export const ScoreBreakdown: React.FC<{
  len: number;
  top: number;
  size: number;
  at: { H: number; E: number; double: number; M: number; P: number; total: number };
}> = ({ len, top, size, at }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const out = ramp(frame, len - 6, 6);
  const tiles = [
    { l: "H", from: at.H, label: "5" },
    { l: "E", from: at.E, label: "1 × 2 = 2", badge: true },
    { l: "M", from: at.M, label: "4" },
    { l: "P", from: at.P, label: "4" },
  ];
  const sum = spring({ frame: frame - at.total, fps, config: { damping: 13, mass: 0.6 } });
  return (
    <AbsoluteFill style={{ opacity: 1 - out, filter: `blur(${out * 4}px)` }}>
      <div
        style={{
          position: "absolute",
          top: top - size * 0.45,
          left: 60,
          right: 60,
          height: size * 3.55,
          borderRadius: 56,
          background: `linear-gradient(180deg, ${C.felt500}, ${C.felt800})`,
          boxShadow: `0 0 0 4px ${C.border}, 0 30px 80px rgba(0,0,0,.6)`,
          opacity: ramp(frame, 0, 8),
          scale: interpolate(ramp(frame, 0, 10), [0, 1], [0.94, 1]),
        }}
      />
      <AbsoluteFill style={{ top, bottom: "auto", flexDirection: "row", justifyContent: "center", gap: size * 0.22 }}>
        {tiles.map((t) => {
          const p = spring({ frame: frame - t.from, fps, config: { damping: 15, mass: 0.7 } });
          const labelIn = ramp(frame, t.badge ? at.double : t.from + 4, 8);
          return (
            <div key={t.l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: size * 0.16, width: size }}>
              <Audio from={t.from} src={staticFile("sfx/tile.mp3")} volume={0.7} />
              {t.badge ? <Audio from={at.double} src={staticFile("sfx/magic.mp3")} volume={0.45} /> : null}
              <div style={{ position: "relative" }}>
                <Tile
                  letter={t.l}
                  size={size}
                  flip={p}
                  lit={ramp(frame, at.total, 8)}
                  style={{ opacity: ramp(frame, t.from, 7), translate: `0 ${interpolate(p, [0, 1], [-size * 0.45, 0])}px` }}
                />
                {t.badge ? (
                  <div
                    style={{
                      position: "absolute",
                      top: -size * 0.2,
                      right: -size * 0.2,
                      fontFamily: F.tile,
                      fontSize: size * 0.3,
                      color: "#fff",
                      background: "linear-gradient(135deg, #c3a6f5, #8559cc 55%, #5b3690)",
                      borderRadius: 999,
                      padding: `${size * 0.05}px ${size * 0.12}px ${size * 0.02}px`,
                      boxShadow: "0 4px 0 #2c1848",
                      opacity: ramp(frame, t.from + 4, 6),
                      scale: interpolate(ramp(frame, t.from + 4, 8), [0, 1], [0.6, 1]),
                    }}
                  >
                    2×
                  </div>
                ) : null}
              </div>
              <div
                style={{
                  fontFamily: F.tile,
                  fontSize: t.badge ? size * 0.3 : size * 0.44,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                  color: t.badge ? "#d9c3ff" : C.gold100,
                  textShadow: "0 4px 0 rgba(0,0,0,.45)",
                  opacity: labelIn,
                  translate: `0 ${(1 - labelIn) * 14}px`,
                  height: size * 0.44,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {t.label}
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      <AbsoluteFill style={{ top: top + size * 1.95, bottom: "auto", alignItems: "center" }}>
        <Audio from={at.total} src={staticFile("sfx/win.mp3")} volume={0.5} />
        <div
          style={{
            fontFamily: F.tile,
            fontSize: size * 0.62,
            lineHeight: 1,
            color: C.onGold,
            background: `linear-gradient(135deg, ${C.gold100}, ${C.gold300} 55%, ${C.gold500})`,
            borderRadius: 999,
            padding: `${size * 0.1}px ${size * 0.34}px ${size * 0.05}px`,
            boxShadow: `inset 0 3px 0 rgba(255,255,255,.55), 0 ${size * 0.04}px 0 ${C.gold600}, 0 ${size * 0.1}px ${size * 0.2}px rgba(0,0,0,.5)`,
            opacity: ramp(frame, at.total, 7),
            scale: interpolate(sum, [0, 1], [0.85, 1]),
            rotate: "-3deg",
          }}
        >
          5 + 2 + 4 + 4 = 15
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
