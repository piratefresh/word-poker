import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Multiplayer flows keep their existing server/opponent runners. Here, servers and builds
// are supplied by the caller so a smoke never kills an unrelated development process.
export const FEATURES = {
  auth: { web: "sign-in" },
  "auth-validation": { web: "auth-validation", native: "auth-validation" },
  registration: { web: "sign-up" },
  home: { web: "home-tabs", native: "home-menu" },
  tutorial: { web: "tutorial", native: "tutorial-coach" },
  story: { web: "story", native: "story" },
  friends: { web: "friends", native: "friends" },
  quests: { web: "quests", native: "quests" },
  store: { web: "store", native: "store" },
  settings: { web: "settings", native: "settings" },
  offline: { web: "offline-hand", native: "offline-hand" },
  wild: { web: "offline-wild-hand" },
  "wild-power": { web: "offline-wild-power" },
  history: { web: "history", native: "history-ledger" },
  lobby: { web: "online-lobby", setup: "Colyseus and hold-table.ts holding Node Table" },
  "lobby-coins": { web: "lobby-coins", setup: "Seeded Wallet personas and hold-table.ts holding Node Table" },
  "create-table": { web: "create-table-layout", setup: "Colyseus" },
  online: { web: "online-hand", native: "online-hand", env: "ROOM_ID", setup: "Classic smoke opponent at seed 409" },
  "online-wild": { web: "online-wild-hand", env: "ROOM_ID", setup: "Wild smoke opponent at seed 518" },
  guest: { web: "online-guest-join", env: "ROOM_ID", setup: "Held invite room; fresh browser profile" },
};

export function plan(args, env = process.env) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    platform: { type: "string", default: "web" },
    list: { type: "boolean" },
    "dry-run": { type: "boolean" },
    headless: { type: "boolean" },
    "screen-size": { type: "string", default: "1280x1000" },
    timeout: { type: "string", default: "600000" },
    output: { type: "string", default: ".tmp/smoke" },
  } });
  if (!["web", "ios", "android"].includes(values.platform)) throw new Error("--platform must be web, ios or android");
  const timeout = Number(values.timeout);
  if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error("--timeout must be a positive integer in milliseconds");
  if (values.headless && values.platform !== "web") throw new Error("--headless is web-only");
  const target = values.platform === "web" ? "web" : "native";
  const names = positionals.length ? [...new Set(positionals)] : Object.keys(FEATURES).filter((name) =>
    FEATURES[name][target] && !FEATURES[name].setup);
  const jobs = names.map((name) => {
    const feature = FEATURES[name];
    if (!feature) throw new Error(`Unknown feature: ${name}. Use --list.`);
    if (!feature[target]) throw new Error(`${name} has no ${values.platform} flow. Use --list.`);
    const flow = target === "web" ? `.maestro/${feature.web}.yaml` : `apps/mobile/.maestro/native/${feature.native}.yaml`;
    const args = ["test", "--platform", values.platform];
    if (values.headless) args.push("--headless", "--screen-size", values["screen-size"]);
    const webURL = env.WEB_URL ?? "http://localhost:8081";
    for (const [key, value] of Object.entries({ WEB_URL: webURL,
      TEST_USER_EMAIL: env.TEST_USER_EMAIL, TEST_USER_PASSWORD: env.TEST_USER_PASSWORD,
      ROOM_ID: env.ROOM_ID })) {
      if (value) args.push("-e", `${key}=${value}`);
    }
    args.push(flow);
    return { name, flow, args, setup: feature.setup,
      blocked: feature.env && !env[feature.env] ? `Set ${feature.env}; requires ${feature.setup}` : null };
  });
  return { values, jobs, timeout };
}

export function main(args = process.argv.slice(2), env = process.env) {
  const { values, jobs, timeout } = plan(args, env);
  if (values.list) {
    for (const [name, feature] of Object.entries(FEATURES)) {
      console.log(`${name.padEnd(14)} ${[feature.web && "web", feature.native && "ios/android"].filter(Boolean).join(", ")}${feature.setup ? ` — ${feature.setup}` : ""}`);
    }
    return 0;
  }
  if (values["dry-run"]) {
    for (const job of jobs) console.log(`${job.name}: ${job.flow}${job.blocked ? ` — BLOCKED: ${job.blocked}` : ""}`);
    return jobs.some((job) => job.blocked) ? 1 : 0;
  }
  const output = resolve(root, values.output, new Date().toISOString().replaceAll(/[:.]/g, "-"));
  mkdirSync(output, { recursive: true });
  const results = [];
  for (const job of jobs) {
    const started = Date.now();
    const directory = resolve(output, job.name);
    mkdirSync(directory, { recursive: true });
    console.log(`\nSmoke: ${job.name} (${values.platform})${job.setup ? ` — requires ${job.setup}` : ""}`);
    let result;
    if (!job.blocked) {
      const command = env.MAESTRO_BIN ?? "maestro";
      // Windows Maestro is a .bat launcher. Quote each argument for cmd; never accept shell
      // metacharacters in values forwarded to it (URLs with query strings are unnecessary).
      const commandArgs = [...job.args, "--format", "JUNIT", "--output", resolve(directory, "junit.xml"),
        "--test-output-dir", directory];
      if (process.platform === "win32") {
        if ([command, ...commandArgs].some((value) => /["%\r\n&|<>^!]/.test(value))) throw new Error("Unsupported shell character in Windows smoke arguments");
        result = spawnSync([command, ...commandArgs].map((value) => `"${value}"`).join(" "), {
          cwd: root, env, shell: true, timeout, encoding: "utf8", maxBuffer: 20 * 1024 * 1024,
        });
      } else {
        result = spawnSync(command, commandArgs, { cwd: root, env, timeout, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
      }
    }
    const status = job.blocked ? "BLOCKED" : result.error ? "ERROR" : result.status === 0 ? "PASS" : "FAIL";
    const detail = job.blocked ?? result.error?.message ?? (result.signal ? `Signal ${result.signal}` : result.status ? `Exit code ${result.status}` : "");
    const log = [result?.stdout, result?.stderr, detail].filter(Boolean).join("\n");
    writeFileSync(resolve(directory, "runner.log"), log);
    results.push({ feature: job.name, status, seconds: Math.round((Date.now() - started) / 1000), detail });
    console.log(`${status}: ${job.name} (${results.at(-1).seconds}s) — ${directory}`);
    // Save after every feature, preserving partial evidence if a later run is interrupted.
    writeFileSync(resolve(output, "results.json"), JSON.stringify({ platform: values.platform,
      planned: jobs.map((job) => job.name), complete: results.length === jobs.length, results }, null, 2));
    writeFileSync(resolve(output, "results.md"), `# Smoke results (${values.platform})\n\n${results.length}/${jobs.length} features finished.\n\n| Feature | Result | Seconds | Detail |\n| --- | --- | --- | --- |\n${results.map((row) => `| ${row.feature} | [${row.status}](${row.feature}/runner.log) | ${row.seconds} | ${row.detail.replaceAll("|", " / ").replaceAll(/\r?\n/g, " ")} |`).join("\n")}\n\nSee each feature folder for JUnit and Maestro artifacts.\n`);
  }
  console.log(`\nReport: ${resolve(output, "results.md")}`);
  return results.every((row) => row.status === "PASS") ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
