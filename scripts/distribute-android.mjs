/**
 * Build an Android APK on EAS and hand it to testers through Firebase App Distribution.
 *
 * The `firebase` EAS profile is production (same API URLs, auto-incremented version code)
 * packaged as an APK, since App Distribution only installs AABs once a Play app is linked.
 *
 * Usage (from the repo root):
 *   pnpm android:distribute            # new EAS build, then upload
 *   pnpm android:distribute --latest   # re-upload the newest finished `firebase` build
 *
 * Needs FIREBASE_ANDROID_APP_ID (Firebase console → Project settings → Your apps,
 * "1:…:android:…") in apps/mobile/.env or the shell, and a one-time
 * `npx firebase-tools login`. FIREBASE_TESTER_GROUPS picks the tester group aliases
 * (comma-separated, default "testers"); release notes are the last commit subject.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_ID = process.env.FIREBASE_ANDROID_APP_ID;
if (!APP_ID) throw new Error("Missing environment variable: FIREBASE_ANDROID_APP_ID (load apps/mobile/.env)");
const GROUPS = process.env.FIREBASE_TESTER_GROUPS ?? "testers";
const MOBILE = join(import.meta.dirname, "..", "apps", "mobile");

function eas(args) {
  const out = execFileSync("eas", [...args, "--platform", "android", "--non-interactive", "--json"], {
    cwd: MOBILE,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  return JSON.parse(out);
}

const [build] = process.argv.includes("--latest")
  ? eas(["build:list", "--build-profile", "firebase", "--status", "finished", "--limit", "1"])
  : eas(["build", "--profile", "firebase", "--wait"]);
const url = build?.artifacts?.buildUrl;
if (!url) throw new Error("No finished `firebase` build with an APK to distribute");

console.log(`Downloading build ${build.id} (${build.appVersion} / ${build.appBuildVersion})`);
const apk = join(mkdtempSync(join(tmpdir(), "wordpoker-apk-")), "word-poker.apk");
const response = await fetch(url);
if (!response.ok) throw new Error(`APK download failed: ${response.status}`);
writeFileSync(apk, Buffer.from(await response.arrayBuffer()));

const notes = execFileSync("git", ["log", "-1", "--format=%s"], { encoding: "utf8" }).trim();
execFileSync("npx", [
  "--yes", "firebase-tools", "appdistribution:distribute", apk,
  "--app", APP_ID,
  "--groups", GROUPS,
  "--release-notes", notes,
], { stdio: "inherit" });
