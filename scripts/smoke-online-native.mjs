#!/usr/bin/env node
/**
 * The seed-409 online hand on a local device: `pnpm smoke:online:android` (Windows or Mac, a
 * USB/emulator device adb can see) or `pnpm smoke:online:ios` (Mac, a booted Simulator).
 *
 * The device runs your development build (`pnpm android:device` / `expo run:ios` once) against a
 * Metro this runner starts with `EXPO_PUBLIC_E2E_AUTH_BYPASS=1` (sign-in is skipped; the flag only
 * lives in this Metro's bundle) and `EXPO_PUBLIC_GAME_URL=ws://localhost:2567`. Android reaches
 * localhost through `adb reverse`; the iOS Simulator shares the Mac's. It then starts a seeded
 * Colyseus, the scripted opponent (`apps/server/scripts/smoke-opponent.ts`), and runs
 * `apps/mobile/.maestro/native/online-hand.yaml` with the opponent's room id. Logs land in the
 * temp directory printed at startup; every child is stopped on exit.
 *
 * Set MAESTRO_BIN to pin one clean Maestro install (an overlayed install with stale JARs crashes
 * on driver install) and SMOKE_TIMEOUT_MS (default 900000) to bound the whole run.
 * Add --web-opponent to play against a second Maestro UI instead of the scripted socket seat
 * (STO-578). The browser creates Cross Platform Table first, then the device joins its room.
 */
import { execFile, spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync } from "node:fs";
import { get } from "node:http";
import { createConnection } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [platform, ...args] = process.argv.slice(2);
const webOpponent = args.includes("--web-opponent");
const headless = args.includes("--headless");
const flow = args.find((arg) => !arg.startsWith("--")) ??
  (webOpponent ? ".maestro/native/cross-platform-hand.yaml" : ".maestro/native/online-hand.yaml");
if (platform !== "android" && platform !== "ios") {
  console.error("usage: node scripts/smoke-online-native.mjs android|ios [flow, relative to apps/mobile] [--web-opponent] [--headless]");
  process.exit(2);
}
if (platform === "ios" && process.platform !== "darwin") {
  console.error("The local iOS smoke needs macOS and a booted iOS Simulator.");
  process.exit(2);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const isWindows = process.platform === "win32";
const gamePort = Number(process.env.SMOKE_GAME_PORT ?? 2567);
const metroPort = Number(process.env.SMOKE_METRO_PORT ?? 8081);
if ([gamePort, metroPort].some((port) => !Number.isInteger(port) || port < 1 || port > 65535) || gamePort === metroPort) {
  console.error("SMOKE_GAME_PORT and SMOKE_METRO_PORT must be distinct ports between 1 and 65535.");
  process.exit(2);
}
const logs = mkdtempSync(join(tmpdir(), "wordpoker-native-smoke-"));
const children = [];
console.log(`Logs: ${logs}`);
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 15 * 60_000);
if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
  console.error("SMOKE_TIMEOUT_MS must be a positive integer no greater than 2147483647.");
  process.exit(2);
}
// Start before setup: server readiness and bundle loading count toward the same deadline.
const timer = setTimeout(() => fail(`Smoke did not finish within ${timeoutMs / 1000}s. Logs: ${logs}`), timeoutMs);

const env = {
  ...process.env,
  WORDPOKER_DETERMINISTIC_SEED: "1",
  SEED: webOpponent ? "505" : "409",
  TABLE_NAME: "Smoke Table",
  BEAT_MS: "700",
  PORT: String(gamePort),
  GAME_URL: `ws://localhost:${gamePort}`,
  EXPO_PUBLIC_GAME_URL: `ws://localhost:${gamePort}`,
  EXPO_PUBLIC_E2E_AUTH_BYPASS: "1",
  // Observed Maestro taps have exceeded the normal 42 s clock. The cause of those delays is
  // still under investigation. Long turns keep the diagnostic hand alive;
  // the payout hold keeps the results up for the flow to read.
  WORDPOKER_SMOKE_ROOM: JSON.stringify({ seed: webOpponent ? 505 : 409, turnDuration: 300_000, payoutDelay: 60_000 }),
  BROWSER: "none",
};

function start(name, command) {
  console.log(`Starting ${name}...`);
  // Straight to a file: logs stay in one place, and nothing downstream depends on draining them.
  const out = openSync(join(logs, `${name}.log`), "a");
  const child = spawn(command, { cwd: root, env, shell: true, detached: !isWindows, stdio: ["ignore", out, out] });
  closeSync(out);
  child.on("error", (error) => fail(`${name} failed to start: ${error.message}`));
  child.on("exit", (code) => {
    if (!stopping) fail(`${name} exited early (${code}); see ${join(logs, `${name}.log`)}`);
  });
  children.push(child);
}

let stopping = false;
function killTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (isWindows) spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { timeout: 5_000 });
  else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        process.kill(child.pid, "SIGTERM");
      } catch {}
    }
  }
}
function stopAll() {
  stopping = true;
  clearTimeout(timer);
  for (const child of children) killTree(child);
}

function fail(message) {
  console.error(message);
  stopAll();
  process.exit(1);
}
process.on("SIGINT", () => fail("interrupted"));
process.on("SIGTERM", () => fail("terminated"));
process.on("uncaughtException", (error) => fail(error.message));
process.on("unhandledRejection", (error) => fail(String(error)));

async function waitFor(what, ready, seconds = 120) {
  console.log(`Waiting for ${what}...`);
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await ready()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`Timed out waiting for ${what}. Logs: ${logs}`);
}

const listening = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(2_000, () => {
      socket.destroy();
      resolve(false);
    });
  });

function which(name, fallbacks) {
  const found = spawnSync(isWindows ? "where" : "which", [name], { encoding: "utf8", timeout: 5_000 });
  if (found.status === 0) return found.stdout.split(/\r?\n/)[0].trim();
  return fallbacks.find((path) => path && existsSync(path));
}

// MAESTRO_BIN pins one install explicitly; a PATH install that has overlayed releases keeps
// stale JARs around and crashes the driver with NoSuchMethodError.
const maestro =
  process.env.MAESTRO_BIN ||
  which("maestro", [join(homedir(), ".maestro", "bin", isWindows ? "maestro.bat" : "maestro")]);
if (!maestro) fail("Maestro was not found on PATH or in ~/.maestro/bin (set MAESTRO_BIN to pick one).");

for (const port of [gamePort, metroPort]) {
  if (await listening(port)) fail(`Port ${port} is in use; stop the dev server / Metro first.`);
}

// ADB here has hung hard enough to wedge whole runs; no call may run unbounded.
function adbCommand(args) {
  return new Promise((resolve) => {
    const child = execFile(adb, args, { encoding: "utf8", timeout: 15_000 }, (error, stdout) => {
      if (stopping) return;
      if (error) {
        const reason = error.killed ? "exceeded the 15s command deadline" : error.message;
        fail(`adb ${args.join(" ")} failed (${reason}); restart ADB before retrying.`);
      }
      resolve(stdout);
    });
    children.push(child);
  });
}
let adb;
if (platform === "android") {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ??
    (isWindows ? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk") : join(homedir(), "Library", "Android", "sdk"));
  adb = which("adb", [join(sdk, "platform-tools", isWindows ? "adb.exe" : "adb")]);
  if (!adb) fail("adb was not found on PATH or in the Android SDK.");
  const deviceList = await adbCommand(["devices"]);
  if (!/\tdevice\b/.test(deviceList))
    fail(`No Android device is connected and authorized:\n${deviceList}`);
  // The device's localhost is not this machine's; reverse both ports the app dials.
  for (const port of [gamePort, metroPort]) await adbCommand(["reverse", `tcp:${port}`, `tcp:${port}`]);
}

start("server", "pnpm --filter @wordpoker/server exec tsx src/index.ts");
// --clear: the EXPO_PUBLIC_ values above are inlined at transform time, so a cached bundle from a
// normal dev session would still point at Colyseus Cloud and the sign-in guard.
start("metro", `pnpm --filter @wordpoker/mobile exec expo start --dev-client --port ${metroPort} --clear`);
await waitFor(`Colyseus on ${gamePort}`, () => listening(gamePort));
// node:http rather than fetch: polling Metro with fetch crashed Node 24 on Windows (0xC0000409).
const metroRunning = () =>
  new Promise((resolve) => {
    const request = get(`http://127.0.0.1:${metroPort}/status`, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => resolve(body.includes("running")));
    });
    request.on("error", () => resolve(false));
    request.setTimeout(2_000, () => {
      request.destroy();
      resolve(false);
    });
  });
await waitFor(`Metro on ${metroPort}`, metroRunning);

// The existing lobby watcher observes listings without occupying a third seat.
let webRun;
let roomId;
if (webOpponent) {
  start("lobby-watch", "pnpm --filter @wordpoker/server exec tsx scripts/smoke-lobby-watch.ts");
  await waitFor("the lobby watcher", () => readLog("lobby-watch").includes("watching the lobby"), 60);
  webRun = runMaestro("web", ".maestro/cross-platform-hand.yaml", root,
    ["-e", `WEB_URL=http://localhost:${metroPort}`, ...(headless ? ["--headless", "--screen-size", "1280x1000"] : [])]);
  await waitFor("the browser to create Cross Platform Table", () => {
    roomId = [...readLog("lobby-watch").matchAll(/table (\S+) "Cross Platform Table" clients=(\d+)/g)]
      .filter((match) => Number(match[2]) === 1).at(-1)?.[1];
    return Boolean(roomId);
  }, 240);
} else {
  start("opponent", "pnpm --filter @wordpoker/server exec tsx scripts/smoke-opponent.ts");
  await waitFor("the opponent's room", () => {
    roomId = readLog("opponent").match(/seated at .*table ([A-Za-z0-9_-]+) as /)?.[1];
    return Boolean(roomId);
  }, 60);
}

function readLog(name) {
  const path = join(logs, `${name}.log`);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function runMaestro(target, targetFlow, cwd, extraArgs) {
  const out = openSync(join(logs, `${target}.log`), "a");
  const argv = ["test", "--platform", target, targetFlow, "--test-output-dir", join(logs, target), ...extraArgs];
  // .bat needs a shell on Windows. PowerShell literals preserve paths with spaces without
  // interpolating Maestro's arguments as shell commands (Node's shell:true concatenates them).
  const quote = (value) => `'${value.replaceAll("'", "''")}'`;
  const command = `& ${[maestro, ...argv].map(quote).join(" ")}; exit $LASTEXITCODE`;
  const child = spawn(isWindows ? "powershell.exe" : maestro,
    isWindows ? ["-NoProfile", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")] : argv,
    { cwd, env, stdio: ["ignore", out, out], detached: !isWindows, windowsHide: true });
  closeSync(out);
  children.push(child);
  child.on("error", (error) => fail(`Maestro ${target} failed to start: ${error.message}`));
  // Attach before any setup waits: a failing browser must stop the device and services too.
  return new Promise((resolve) => child.on("exit", (code) => {
    if (!stopping && code !== 0) fail(`Maestro ${target} failed (${code}). See ${join(logs, `${target}.log`)}`);
    resolve(code);
  }));
}

// Cold-start the dev client straight onto this Metro. Launched any other way it reopens the last
// Metro it used, which may be another machine's, with another game server baked in.
const APP_ID = "com.wordpoker.wordpoker";
const devLink = "exp+word-poker://expo-development-client/?url=" + encodeURIComponent(`http://localhost:${metroPort}`);
if (platform === "android") {
  await adbCommand(["shell", "am", "force-stop", APP_ID]);
  await adbCommand(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"${devLink}"`, APP_ID]);
} else {
  spawnSync("xcrun", ["simctl", "terminate", "booted", APP_ID], { timeout: 15_000 });
  const opened = spawnSync("xcrun", ["simctl", "openurl", "booted", devLink], { stdio: "inherit", timeout: 15_000 });
  if (opened.error || opened.status !== 0) fail(`Could not open the iOS dev client (${opened.error?.message ?? opened.status}).`);
}

console.log(`Running ${platform} smoke in room ${roomId}...`);
// Track Maestro too, so cancellation, failures and the deadline stop its driver process tree.
const run = runMaestro(platform, flow, join(root, "apps", "mobile"),
  ["-e", `ROOM_ID=${roomId}`, "-e", "ATTACH=1"]);
const statuses = await Promise.all([run, ...(webRun ? [webRun] : [])]);
const status = statuses.every((code) => code === 0) ? 0 : 1;
stopAll();
console.log(status === 0 ? `${webOpponent ? "Cross-platform" : "Native"} online smoke passed.` : `Online smoke failed. Logs: ${logs}`);
process.exit(status ?? 1);
