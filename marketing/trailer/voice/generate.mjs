/**
 * Ellis's lines → one ElevenLabs clip each, in public/voice/<id>.mp3, plus durations.json so the
 * edit can time captions and cuts to the real audio; also any missing SFX in public/sfx/.
 * Pass a line id (or a made-up one, to regenerate no lines) to limit which lines are re-voiced.
 *
 *   node --env-file=marketing/trailer/.env.local marketing/trailer/voice/generate.mjs [id]...
 *
 * The SDK reads ELEVENLABS_API_KEY (written by `npx @elevenlabs/cli onboard`); ELEVENLABS_VOICE_ID
 * overrides the voice (Jessica — playful, bright, warm — by default).
 */
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../public/voice");
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "cgSgspJ2msm6clMCkdW9";

const client = new ElevenLabsClient();
const lines = JSON.parse(await readFile(path.join(HERE, "script.json"), "utf8"));
const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });

const voiced = lines.filter((l) => !only.length || only.includes(l.id));
for (const line of voiced) {
  const audio = await client.textToSpeech.convert(VOICE, {
    text: line.text,
    modelId: "eleven_v4",
    outputFormat: "mp3_44100_128",
    voiceSettings: { stability: 0.4, similarityBoost: 0.8 },
  });
  await writeFile(path.join(OUT, `${line.id}.mp3`), Buffer.from(await new Response(audio).arrayBuffer()));
  console.log(`${line.id}: ok`);
}

/** Foley for the edit → public/sfx/<id>.mp3. Existing files are kept, so reruns don't spend credits. */
const SFX = {
  tile: ["a single wooden letter tile snapped down onto a felt card table, short crisp click", 0.5],
  chips: ["a few clay poker chips tossed onto felt, short clacking", 0.8],
  pop: ["bright playful game pop-up, cartoon pop with a sparkle", 0.6],
  win: ["casino win sting, bright coins cascading with a cheerful chime", 1.6],
  whoosh: ["quick soft whoosh, fast camera swipe transition", 0.5],
  magic: ["magical power-up activation shimmer, sparkly whoosh", 1.0],
};
const SFX_OUT = path.resolve(HERE, "../public/sfx");
await mkdir(SFX_OUT, { recursive: true });
for (const [id, [text, durationSeconds]] of Object.entries(SFX)) {
  const file = path.join(SFX_OUT, `${id}.mp3`);
  if (await readFile(file).then(() => true, () => false)) continue;
  const audio = await client.textToSoundEffects.convert({
    text,
    modelId: "eleven_text_to_sound_v3",
    durationSeconds,
    promptInfluence: 0.6,
  });
  await writeFile(file, Buffer.from(await new Response(audio).arrayBuffer()));
  console.log(`sfx ${id}: ok`);
}

/**
 * Word timings for the captions → public/voice/captions.json ({ id: Caption[] }, @remotion/captions'
 * shape), transcribed with Scribe for lines voiced this run or not yet captioned. The script's own
 * spelling wins whenever Scribe hears the same number of words.
 */
const CAPTIONS = path.join(OUT, "captions.json");
const captions = JSON.parse(await readFile(CAPTIONS, "utf8").catch(() => "{}"));
for (const line of lines) {
  if (captions[line.id] && !voiced.includes(line)) continue;
  const result = await client.speechToText.convert({
    file: createReadStream(path.join(OUT, `${line.id}.mp3`)),
    modelId: "scribe_v3",
    languageCode: "en",
    timestampsGranularity: "word",
  });
  // Scribe hears the brand as two words; put it back together.
  const heard = result.words
    .filter((w) => w.type === "word")
    .reduce((acc, w) => {
      const prev = acc[acc.length - 1];
      if (prev?.text === "Word" && w.text.startsWith("Poker")) prev.text = `Word${w.text}`, (prev.end = w.end);
      else acc.push({ ...w });
      return acc;
    }, []);
  const said = line.text.split(" ");
  captions[line.id] = heard.map((w, i) => ({
    text: `${i ? " " : ""}${heard.length === said.length ? said[i] : w.text}`,
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
    timestampMs: Math.round(((w.start + w.end) / 2) * 1000),
    confidence: null,
  }));
  console.log(`captions ${line.id}: ${heard.length === said.length ? "script words" : `Scribe words (${result.text})`}`);
}
await writeFile(CAPTIONS, JSON.stringify(captions, null, 2) + "\n");

const durations = {};
for (const line of lines) {
  const file = path.join(OUT, `${line.id}.mp3`);
  try {
    durations[line.id] = Number(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim(),
    );
  } catch {}
}
await writeFile(path.join(OUT, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
console.log(durations);
