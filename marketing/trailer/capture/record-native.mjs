/**
 * Records the trailer's takes natively from the iOS Simulator: a Maestro flow drives each take while
 * `simctl io recordVideo` captures the screen at the device's own resolution.
 *
 *   node marketing/trailer/capture/record-native.mjs [classic|wild|social|lobby|story|quests]...
 *
 * Needs a development build on the "Trailer 17 Pro Max" simulator (SIM_UDID overrides), loading JS
 * from Metro on 8081 (`npx expo run:ios --device <udid> --no-bundler`), signed in as the seeded E2E
 * user. `social` also needs `node scripts/friends-social-fixture.mjs` running. `lobby` opens the
 * new-table form and cancels; it never creates a table. Clips land in public/footage/<name>.mp4.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "../public/footage");
const MAESTRO = process.env.MAESTRO_BIN ?? path.join(os.homedir(), ".maestro/bin/maestro");
const UDID =
  process.env.SIM_UDID ??
  Object.values(JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "-j"])).devices)
    .flat()
    .find((d) => d.name === "Trailer 17 Pro Max")?.udid;
if (!UDID) throw new Error('No "Trailer 17 Pro Max" simulator; set SIM_UDID');

const flow = (steps) => `appId: com.wordpoker.wordpoker\n---\n${steps.trim()}\n`;
/** Maestro has no sleep: waiting on text that never shows, optionally, holds the shot. */
const hold = (ms) => `- extendedWaitUntil:\n    visible: "zz-never-zz"\n    timeout: ${ms}\n    optional: true\n`;
const waitId = (id, ms = 30000) => `- extendedWaitUntil:\n    visible:\n      id: "${id}"\n    timeout: ${ms}\n`;
const waitText = (text, ms = 30000) => `- extendedWaitUntil:\n    visible: "${text}"\n    timeout: ${ms}\n`;
const tapId = (id) => `- tapOn:\n    id: "${id}"\n    waitToSettleTimeoutMs: 300\n`;
/** iOS asks "Open in WordPoker?" for every deep link. */
const link = (url) =>
  `- openLink: ${url}\n- tapOn:\n    text: "Open"\n    optional: true\n`;

/** Unrecorded: back to a settled home screen before every take. */
const HOME = flow(`
- launchApp:
    clearState: false
- tapOn:
    text: "Continue"
    optional: true
${link("wordpoker://")}
${waitText("Play Online", 120000)}
${hold(1500)}
`);

const TAKES = {
  classic: `
${link("wordpoker://offline?seed=371&turn=300000")}
${waitText("PREFLOP( [1-5]/5)?", 90000)}
${hold(1200)}
- extendedWaitUntil:
    visible:
      id: "action-check-call"
      text: "Call \\\\$20"
    timeout: 20000
${tapId("action-check-call")}
${waitText("FLOP( [1-5]/5)?", 20000)}
${waitText("YOUR TURN", 20000)}
${tapId("action-check-call")}
${waitText("TURN( [1-5]/5)?", 20000)}
${waitText("YOUR TURN", 20000)}
${tapId("action-check-call")}
${waitText("RIVER( [1-5]/5)?", 20000)}
${waitText("YOUR TURN", 20000)}
${hold(600)}
${tapId("action-raise")}
${hold(500)}
${tapId("wager-preset-minimum")}
${hold(700)}
${tapId("action-wager")}
- extendedWaitUntil:
    visible:
      id: "action-check-call"
      text: "Call \\\\$500"
    timeout: 20000
${hold(800)}
${tapId("word-builder-tile-H-1")}
${hold(450)}
${tapId("word-builder-tile-E-3")}
${hold(450)}
${tapId("word-builder-tile-M-2")}
${hold(450)}
${tapId("word-builder-tile-P-2")}
${hold(1200)}
${tapId("action-check-call")}
${waitText("Pot, 2,600 chips\\\\..*", 20000)}
${hold(2500)}
`,
  wild: `
${link("wordpoker://offline?seed=178&powers=wild&turn=300000")}
# Maestro can neither see nor tap the Power Draw overlay on iOS within its fixed 10 s, so the
# take lets the draw run out: time-up deals the Blank Tile, which the hand then uses to make an O.
${hold(12000)}
- extendedWaitUntil:
    visible:
      id: "action-check-call"
      text: "Call \\\\$60"
    timeout: 20000
${hold(800)}
${tapId("power-held")}
${hold(800)}
${tapId("word-builder-tile-H-2")}
${hold(1000)}
${tapId("power-confirm")}
${waitId("word-builder-tile-power-0", 10000)}
${hold(1800)}
${tapId("word-builder-tile-M-1")}
${hold(500)}
${tapId("word-builder-tile-power-0")}
${hold(900)}
- inputText: "O"
${hold(3000)}
`,
  social: `
${hold(1500)}
${tapId("tab-friends")}
${waitId("friends-tab-all")}
${tapId("friends-tab-all")}
${waitId("friend-join-.*")}
${hold(3000)}
${tapId("friend-nudge-.*")}
${hold(2500)}
`,
  lobby: `
${link("wordpoker://online")}
${waitText(".*DEAL A NEW TABLE", 60000)}
${hold(1500)}
- tapOn: "Wild Power"
${hold(1500)}
- tapOn: ".*DEAL A NEW TABLE"
${waitText("CREATE · .*", 15000)}
${hold(1200)}
- scrollUntilVisible:
    element:
      id: "create-table-power-ups"
    direction: DOWN
${hold(2500)}
- tapOn: "Cancel"
${hold(800)}
`,
  story: `
${link("wordpoker://story")}
${waitId("story-map", 60000)}
${hold(2500)}
${tapId("story-node-first-hand")}
${waitId("story-deal", 15000)}
${hold(2500)}
${tapId("story-deal")}
${waitId("poker-table", 90000)}
${hold(5000)}
`,
  quests: `
${tapId("home-level")}
${waitId("quest-wallet")}
${hold(2500)}
- swipe:
    direction: UP
    duration: 900
${hold(2500)}
${link("wordpoker://")}
${waitText("Play Online")}
${tapId("tab-store")}
${waitId("store-daily-bonus")}
${hold(2000)}
${tapId("store-tab-tiles")}
${hold(3000)}
`,
};

const tmp = await mkdtemp(path.join(os.tmpdir(), "trailer-maestro-"));
const run = async (name, yaml) => {
  const file = path.join(tmp, `${name}.yaml`);
  await writeFile(file, yaml);
  execFileSync(MAESTRO, ["--device", UDID, "test", file], { stdio: ["ignore", "inherit", "inherit"] });
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAKES);
for (const name of names) {
  await run("home", HOME);
  const file = path.join(OUT, `${name}.mp4`);
  const raw = path.join(tmp, `${name}.raw.mp4`);
  const rec = spawn("xcrun", ["simctl", "io", UDID, "recordVideo", "--codec=h264", "--force", raw], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const recorded = new Promise((r) => rec.on("exit", r));
  await new Promise((r) => setTimeout(r, 1500));
  const started = Date.now();
  try {
    await run(name, flow(TAKES[name]));
  } catch {
    console.error(`${name}: the flow failed; the clip keeps what was recorded`);
  }
  await new Promise((r) => setTimeout(r, 800));
  rec.kill("SIGINT");
  await recorded;
  // simctl writes frames only when the screen changes; re-encode to a steady 30 fps (exact seeks
  // in the edit) at full resolution, which is also far smaller than the raw capture.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-vf", "fps=30", "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-an", file]);
  await rm(raw, { force: true });
  console.log(`${name}: ${Math.round((Date.now() - started) / 1000)}s → public/footage/${name}.mp4`);
}
await rm(tmp, { recursive: true, force: true });
