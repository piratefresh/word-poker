import type { Caption } from "@remotion/captions";
import { Audio, Video } from "@remotion/media";
import type React from "react";
import { useMemo } from "react";
import { AbsoluteFill, Sequence, Series, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import captions from "../public/voice/captions.json";
import durations from "../public/voice/durations.json";
import script from "../voice/script.json";
import { EASE_OUT, Felt, Pop, TileRow } from "./parts";
import { EndCard, Logo, Outro } from "./scenes";
import { C, F, clamp } from "./theme";

/**
 * One shot per Ellis line, each as long as its voice clip (voice/durations.json) plus a breath, so
 * re-recording a line re-times the cut. Times inside a shot use `v(seconds into the line)`.
 * Ellis is heard, not seen: the logo, then full-screen gameplay, then the end card.
 */
export const FPS = 30;
const LEAD = 6;
const TAIL = 12;
const BLEND = 8;
const MIN_LEN: Record<string, number> = { "10-cta": Math.round(5.5 * FPS) };
const v = (s: number) => LEAD + Math.round(s * FPS);

let cursor = 0;
export const SHOTS = script.map((line) => {
  const voice = Math.ceil(durations[line.id as keyof typeof durations] * FPS);
  const len = Math.max(LEAD + voice + TAIL, MIN_LEN[line.id] ?? 0);
  const shot = { ...line, voice, len, from: cursor };
  cursor += len;
  return shot;
});
/** The closing card after the call to action: wordmark, tagline, site. */
const OUTRO = Math.round(3 * FPS);
export const TOTAL = cursor + OUTRO;
const [hello, deal, bet, spell, score, wild, online, story, quests, cta] = SHOTS;
/** The spell shot is four jump cuts, one per letter tap. */
const TAP = Math.floor(spell.len / 4);
/** In the score shot, "Fifteen points!" starts 2.9 s into the line. */
const SCORE_AT = v(2.9);

/**
 * A stretch of native footage (capture/record-native.mjs, iPhone 17 Pro Max at 1320×2868); `at` is
 * the second it starts from. The phone screen is taller than 9:16, so it plays at full height,
 * 884 px wide, over a blurred copy of itself. Each cut settles from a slight punch-in.
 */
const Clip: React.FC<{ src: "classic" | "wild" | "lobby" | "social" | "story" | "quests"; at: number; rate?: number }> = ({ src, at, rate = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const media = { src: staticFile(`footage/${src}.mp4`), trimBefore: Math.round(at * fps), playbackRate: rate, muted: true };
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: C.felt800 }}>
      <Video {...media} objectFit="cover" style={{ width: "100%", height: "100%", scale: 1.15, filter: "blur(36px) brightness(.42) saturate(1.2)" }} />
      <AbsoluteFill style={{ alignItems: "center", scale: interpolate(frame, [0, 10], [1.035, 1], { ...clamp, easing: EASE_OUT }) }}>
        <Video {...media} objectFit="contain" style={{ width: 884, height: "100%", boxShadow: "0 0 80px rgba(0,0,0,.55)" }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Blurs a scene in and out over its neighbours, `BLEND` frames each way (gameplay; the end card into the outro). */
const Blend: React.FC<{ len: number; fadeIn?: boolean; children: React.ReactNode }> = ({ len, fadeIn = true, children }) => {
  const frame = useCurrentFrame();
  const inn = fadeIn ? interpolate(frame, [0, BLEND], [0, 1], { ...clamp, easing: EASE_OUT }) : 1;
  const out = interpolate(frame, [len - BLEND, len], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <AbsoluteFill
      style={{
        opacity: inn * (1 - out),
        filter: `blur(${(1 - inn) * 14 + out * 14}px)`,
        scale: interpolate(inn, [0, 1], [1.06, 1]) * (1 + out * 0.04),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Pages that end on punctuation (a phrase each), two lines at most (seven words). */
const toPages = (words: Caption[]) => {
  const pages: Array<{ startMs: number; tokens: Array<{ text: string; fromMs: number; toMs: number }> }> = [];
  let open = true;
  words.forEach((w, i) => {
    if (open) pages.push({ startMs: w.startMs, tokens: [] });
    const page = pages[pages.length - 1];
    page.tokens.push({ text: page.tokens.length ? w.text : w.text.trimStart(), fromMs: w.startMs, toMs: words[i + 1]?.startMs ?? w.endMs });
    open = /[.!?,…]$/.test(w.text) || page.tokens.length === 7;
  });
  return pages;
};

/**
 * Ellis's line as burned-in captions for sound-off viewing: a phrase per page, the word she is
 * saying in gold. Mounted at the voice clip's start, so its frame 0 is the clip's 0 ms.
 */
const Captions: React.FC<{ id: string; len: number }> = ({ id, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => toPages((captions as Record<string, Caption[]>)[id]), [id]);
  const ms = (frame / fps) * 1000;
  const page = [...pages].reverse().find((p) => ms >= p.startMs - 60);
  if (!page) return null;
  const enter = interpolate(ms, [page.startMs - 60, page.startMs + 110], [0, 1], { ...clamp, easing: EASE_OUT });
  const out = interpolate(frame, [len - 5, len], [0, 1], { ...clamp, easing: EASE_OUT });
  return (
    <AbsoluteFill
      style={{
        top: "auto",
        bottom: 250,
        height: 260,
        padding: "0 80px",
        alignItems: "center",
        justifyContent: "flex-end",
        opacity: enter * (1 - out),
        translate: `0 ${(1 - enter) * 16}px`,
      }}
    >
      <div
        style={{
          fontFamily: F.ui,
          fontWeight: 700,
          fontSize: 80,
          lineHeight: 1.08,
          textAlign: "center",
          textWrap: "balance",
          textShadow: "0 5px 0 rgba(0,0,0,.5), 0 0 24px rgba(0,0,0,.6)",
        }}
      >
        {page.tokens.map((t) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          const said = ms >= t.fromMs;
          return (
            <span
              key={t.fromMs}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                color: active ? C.gold100 : C.cream100,
                opacity: said ? 1 : 0.5,
                scale: active ? 1.05 : 1,
              }}
            >
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Trailer: React.FC = () => {
  const sfx = (name: string) => staticFile(`sfx/${name}.mp3`);
  const gameplayLen = cta.from - deal.from + BLEND;
  return (
    <AbsoluteFill>
      <Felt />

      <Sequence name="Logo" from={hello.from} durationInFrames={hello.len + BLEND}>
        <Logo delay={4} len={hello.len + BLEND} />
        <Audio from={4} src={sfx("pop")} volume={0.5} />
      </Sequence>

      <Sequence name="End card" from={cta.from} durationInFrames={cta.len + BLEND}>
        <Blend len={cta.len + BLEND} fadeIn={false}>
          <EndCard />
        </Blend>
        <Audio from={2} src={sfx("pop")} volume={0.5} />
        <Audio from={40} src={sfx("win")} volume={0.45} />
      </Sequence>

      <Sequence name="Outro" from={cta.from + cta.len}>
        <Outro />
        <Audio src={sfx("pop")} volume={0.4} />
      </Sequence>

      <Sequence name="Gameplay" from={deal.from} durationInFrames={gameplayLen}>
        <Blend len={gameplayLen}>
          <Series>
            <Series.Sequence name="Deal" durationInFrames={deal.len}>
              <Clip src="classic" at={15.5} />
            </Series.Sequence>
            <Series.Sequence name="Bet" durationInFrames={bet.len}>
              <Clip src="classic" at={31} rate={6.5} />
            </Series.Sequence>
            {/* One jump cut per letter tap: H, E, M, P. */}
            {[84.7, 94.2, 103.2, 112.7].map((at, i) => (
              <Series.Sequence key={at} name={`Spell: tap ${i + 1}`} durationInFrames={i < 3 ? TAP : spell.len - 3 * TAP}>
                <Clip src="classic" at={at} />
              </Series.Sequence>
            ))}
            {/* "Double and triple letters…" holds on the rack with the 2× E, then the score plays out. */}
            <Series.Sequence name="Score: multipliers" durationInFrames={SCORE_AT}>
              <Clip src="classic" at={105} />
            </Series.Sequence>
            <Series.Sequence name="Score" durationInFrames={score.len - SCORE_AT}>
              <Clip src="classic" at={113} rate={2.8} />
            </Series.Sequence>
            <Series.Sequence name="Wild: lobby" durationInFrames={40}>
              <Clip src="lobby" at={15.5} rate={1.5} />
            </Series.Sequence>
            <Series.Sequence name="Wild: new table" durationInFrames={35}>
              <Clip src="lobby" at={26.4} />
            </Series.Sequence>
            <Series.Sequence name="Wild: Power Draw" durationInFrames={40}>
              <Clip src="wild" at={16} rate={1.5} />
            </Series.Sequence>
            <Series.Sequence name="Wild: discard H" durationInFrames={18}>
              <Clip src="wild" at={45.5} />
            </Series.Sequence>
            <Series.Sequence name="Wild: type a letter" durationInFrames={12}>
              <Clip src="wild" at={74.5} />
            </Series.Sequence>
            <Series.Sequence name="Wild: MO" durationInFrames={wild.len - 145}>
              <Clip src="wild" at={81} />
            </Series.Sequence>
            <Series.Sequence name="Online: home" durationInFrames={33}>
              <Clip src="social" at={14} />
            </Series.Sequence>
            <Series.Sequence name="Online: friends" durationInFrames={online.len - 33}>
              <Clip src="social" at={18.5} />
            </Series.Sequence>
            <Series.Sequence name="Story: map" durationInFrames={75}>
              <Clip src="story" at={15.5} rate={1.2} />
            </Series.Sequence>
            <Series.Sequence name="Story: First Hand" durationInFrames={30}>
              <Clip src="story" at={27.3} />
            </Series.Sequence>
            <Series.Sequence name="Story: coached table" durationInFrames={story.len - 105}>
              <Clip src="story" at={34} />
            </Series.Sequence>
            <Series.Sequence name="Quests" durationInFrames={75}>
              <Clip src="quests" at={15.5} rate={1.4} />
            </Series.Sequence>
            <Series.Sequence name="Store: tile sets" durationInFrames={quests.len - 75 + BLEND}>
              <Clip src="quests" at={38.5} />
            </Series.Sequence>
          </Series>
        </Blend>
      </Sequence>

      {/* Pop-up positions follow the native layout: a screen point (x, y) sits at (98 + 2.008x, 2.008y). */}
      <Sequence name="Deal: hole tiles" from={deal.from + v(2.7)} durationInFrames={deal.len - v(2.7)}>
        <TileRow letters="UH" at={[0, 6]} len={deal.len - v(2.7)} top={1020} size={210} />
      </Sequence>
      <Sequence name="Bet: flop" from={bet.from + v(0.4)} durationInFrames={30}>
        <Pop len={30} top={500} tilt={-4} sfx="chips">FLOP</Pop>
      </Sequence>
      <Sequence name="Bet: turn" from={bet.from + v(1.45)} durationInFrames={30}>
        <Pop len={30} top={500} tilt={3} sfx="chips">TURN</Pop>
      </Sequence>
      <Sequence name="Bet: river" from={bet.from + v(2.55)} durationInFrames={bet.len - v(2.55)}>
        <Pop len={bet.len - v(2.55)} top={500} tilt={-3} sfx="chips">RIVER</Pop>
      </Sequence>
      <Sequence name="Spell: HEMP" from={spell.from} durationInFrames={spell.len}>
        <TileRow letters="HEMP" at={[9, TAP + 9, 2 * TAP + 9, 3 * TAP + 9]} len={spell.len} top={940} size={170} />
      </Sequence>
      <Sequence name="Score: multipliers" from={score.from + v(0.1)} durationInFrames={v(2.7) - v(0.1)}>
        <Pop len={v(2.7) - v(0.1)} top={500} size={120} tilt={-3} tone="purple" sfx="magic">2× · 3× LETTERS</Pop>
      </Sequence>
      <Sequence name="Score: +15" from={score.from + SCORE_AT} durationInFrames={v(4.4) - SCORE_AT}>
        <Pop len={v(4.4) - SCORE_AT} top={960} size={220} tilt={-5} sfx="win">+15</Pop>
      </Sequence>
      <Sequence name="Score: pot" from={score.from + v(5.1)} durationInFrames={score.len - v(5.1)}>
        <Pop len={score.len - v(5.1)} top={790} size={140} tilt={3} sfx="chips">POT 2,600</Pop>
      </Sequence>
      <Sequence name="Wild: mode" from={wild.from + v(1.8)} durationInFrames={77 - v(1.8)}>
        <Pop len={77 - v(1.8)} top={300} size={104} tilt={-3} tone="purple" sfx="magic">WILD POWER MODE</Pop>
      </Sequence>
      <Sequence name="Wild: draw" from={wild.from + 77} durationInFrames={38}>
        <Pop len={38} top={300} size={110} tilt={3} tone="purple" sfx="pop">PICK A POWER</Pop>
      </Sequence>
      <Sequence name="Wild: H to O" from={wild.from + 147} durationInFrames={wild.len - 147}>
        <Pop len={wild.len - 147} top={1060} size={170} tilt={4} sfx="pop">H → O</Pop>
      </Sequence>
      <Sequence name="Online: friends" from={online.from + v(0.95)} durationInFrames={v(1.9) - v(0.95)}>
        <Pop len={v(1.9) - v(0.95)} top={1180} size={130} tilt={-3} sfx="pop">PLAY FRIENDS</Pop>
      </Sequence>
      <Sequence name="Online: invite" from={online.from + v(2.3)} durationInFrames={online.len - v(2.3)}>
        <Pop len={online.len - v(2.3)} top={900} size={84} tilt={3} sfx="chips">INVITE · JOIN · NUDGE</Pop>
      </Sequence>
      <Sequence name="Story: mode" from={story.from + v(1.7)} durationInFrames={75 - v(1.7)}>
        <Pop len={75 - v(1.7)} top={260} size={140} tilt={-3} sfx="magic">STORY MODE</Pop>
      </Sequence>
      <Sequence name="Quests: daily" from={quests.from + v(0.4)} durationInFrames={v(1.45) - v(0.4)}>
        <Pop len={v(1.45) - v(0.4)} top={1150} size={130} tilt={-3} sfx="pop">DAILY QUESTS</Pop>
      </Sequence>
      <Sequence name="Quests: earn coins" from={quests.from + v(1.5)} durationInFrames={75 - v(1.5)}>
        <Pop len={75 - v(1.5)} top={1150} size={150} tilt={3} sfx="win">EARN COINS</Pop>
      </Sequence>
      <Sequence name="Store: tile sets" from={quests.from + v(2.6)} durationInFrames={quests.len - v(2.6)}>
        <Pop len={quests.len - v(2.6)} top={1200} size={130} tilt={-3} sfx="chips">NEW TILE SETS</Pop>
      </Sequence>

      <Audio from={deal.from - 5} src={sfx("whoosh")} volume={0.3} />
      <Audio from={cta.from - 5} src={sfx("whoosh")} volume={0.3} />
      <AbsoluteFill
        style={{ top: "auto", height: 720, background: "linear-gradient(transparent, rgba(4,12,9,.55) 45%, rgba(4,12,9,.8))" }}
      />
      {SHOTS.map((s) => (
        <Sequence key={s.id} name={`Ellis ${s.id}`} from={s.from + LEAD} durationInFrames={s.len - LEAD}>
          <Audio src={staticFile(`voice/${s.id}.mp3`)} />
          <Captions id={s.id} len={s.len - LEAD} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
