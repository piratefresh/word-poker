/**
 * slot-speller-sound.ts — Slot Speller's sound (STO-1185): each effect's takes, played at its mix
 * level with a fresh take each time, the reel-spin loop, and the device's sound on/off. Players are
 * built on first use and kept, as the wager button's are; a refused audio session is never an error.
 */

import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useSyncExternalStore } from "react";

import { readItem, writeItem } from "@/lib/storage/claim-store";

// Metro bundles only static requires: one per take.
const TAKES = {
  spin: [require("@/assets/sounds/slot-speller/spin1.mp3"), require("@/assets/sounds/slot-speller/spin2.mp3")],
  stop: [
    require("@/assets/sounds/slot-speller/stop1.mp3"),
    require("@/assets/sounds/slot-speller/stop2.mp3"),
    require("@/assets/sounds/slot-speller/stop3.mp3"),
    require("@/assets/sounds/slot-speller/stop4.mp3"),
  ],
  nudge: [
    require("@/assets/sounds/slot-speller/nudge1.mp3"),
    require("@/assets/sounds/slot-speller/nudge2.mp3"),
    require("@/assets/sounds/slot-speller/nudge3.mp3"),
  ],
  pick: [require("@/assets/sounds/slot-speller/pick1.mp3"), require("@/assets/sounds/slot-speller/pick2.mp3")],
  swap: [require("@/assets/sounds/slot-speller/swap1.mp3"), require("@/assets/sounds/slot-speller/swap2.mp3")],
  chime: [require("@/assets/sounds/slot-speller/chime1.mp3"), require("@/assets/sounds/slot-speller/chime2.mp3")],
  coin: [
    require("@/assets/sounds/slot-speller/coin1.mp3"),
    require("@/assets/sounds/slot-speller/coin2.mp3"),
    require("@/assets/sounds/slot-speller/coin3.mp3"),
    require("@/assets/sounds/slot-speller/coin4.mp3"),
  ],
  fanfare: [
    require("@/assets/sounds/slot-speller/fanfare1.mp3"),
    require("@/assets/sounds/slot-speller/fanfare2.mp3"),
    require("@/assets/sounds/slot-speller/fanfare3.mp3"),
  ],
  buy: [require("@/assets/sounds/slot-speller/buy1.mp3"), require("@/assets/sounds/slot-speller/buy2.mp3")],
  reroll: [require("@/assets/sounds/slot-speller/reroll1.mp3"), require("@/assets/sounds/slot-speller/reroll2.mp3")],
  short: [require("@/assets/sounds/slot-speller/short1.mp3"), require("@/assets/sounds/slot-speller/short2.mp3")],
  over: [require("@/assets/sounds/slot-speller/over1.mp3"), require("@/assets/sounds/slot-speller/over2.mp3")],
} satisfies Record<string, number[]>;

export type SlotSound = keyof typeof TAKES;

/** Each effect's mix level. */
const GAIN: Record<SlotSound, number> = {
  spin: 0.55,
  stop: 0.9,
  nudge: 0.8,
  pick: 0.8,
  swap: 0.8,
  chime: 0.85,
  coin: 0.55,
  fanfare: 0.9,
  buy: 0.85,
  reroll: 0.9,
  short: 0.85,
  over: 0.8,
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
/** The highest the chimes climb, in semitones over the take. */
const MAX_SEMITONES = 19;

/** A random take of `count`, never `last` again while there is another to pick. */
export function pickTake(count: number, last: number | undefined, random: () => number = Math.random): number {
  const pool = [...Array(count).keys()].filter((take) => count === 1 || take !== last);
  return pool[Math.floor(random() * pool.length)] ?? 0;
}

/** The nth paying word's chime: one step higher up a major scale per word. */
export function chimeRate(index: number): number {
  const semitones = (MAJOR[index % MAJOR.length] ?? 0) + 12 * Math.floor(index / MAJOR.length);
  return 2 ** (Math.min(semitones, MAX_SEMITONES) / 12);
}

const SOUND_KEY = "slot-speller-sound";
let soundOn: boolean | null = null;
const listeners = new Set<() => void>();

export function slotSoundOn(): boolean {
  soundOn ??= readItem(SOUND_KEY) !== "off";
  return soundOn;
}

export function setSlotSoundOn(on: boolean): void {
  if (!on) stopSpinLoop();
  soundOn = on;
  writeItem(SOUND_KEY, on ? "on" : "off");
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSlotSoundOn(): boolean {
  return useSyncExternalStore(subscribe, slotSoundOn, slotSoundOn);
}

const players = new Map<number, AudioPlayer>();
const lastTake: Partial<Record<SlotSound, number>> = {};
let spinPlayer: AudioPlayer | null = null;

/** A fresh take of `name`, ready to play at its level; `null` with sound off. */
function take(name: SlotSound, gain: number): AudioPlayer | null {
  if (!slotSoundOn()) return null;
  const takes = TAKES[name];
  const index = pickTake(takes.length, lastTake[name]);
  lastTake[name] = index;
  const source = takes[index] ?? takes[0];
  let player = players.get(source);
  if (!player) players.set(source, (player = createAudioPlayer(source)));
  player.volume = GAIN[name] * gain;
  return player;
}

/** One effect, once. `rate` shifts pitch with speed (pitch correction off), as the chimes climb. */
export function playSlotSound(name: SlotSound, { rate = 1, gain = 1 }: { rate?: number; gain?: number } = {}): void {
  try {
    const player = take(name, gain);
    if (player === null) return;
    // ponytail: native rate tops out at 2.0, so chimes past the octave ring at the octave.
    player.shouldCorrectPitch = false;
    player.setPlaybackRate(rate);
    void player.seekTo(0).catch(() => {});
    player.play();
  } catch {}
}

/** The reels' spin, looped until `stopSpinLoop`. */
export function startSpinLoop(): void {
  stopSpinLoop();
  try {
    const player = take("spin", 1);
    if (player === null) return;
    player.loop = true;
    void player.seekTo(0).catch(() => {});
    player.play();
    spinPlayer = player;
  } catch {}
}

export function stopSpinLoop(): void {
  try {
    spinPlayer?.pause();
  } catch {}
  spinPlayer = null;
}
