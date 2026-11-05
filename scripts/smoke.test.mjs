import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { FEATURES, main, plan } from "./smoke.mjs";

test("every listed feature points at an existing flow on its supported platforms", () => {
  for (const name of Object.keys(FEATURES)) {
    for (const platform of [...(FEATURES[name].web ? ["web"] : []), ...(FEATURES[name].native ? ["ios", "android"] : [])]) {
      for (const job of plan([name, "--platform", platform], {}).jobs) assert(existsSync(job.flow), job.flow);
    }
  }
});

test("default suite excludes flows needing room orchestration; explicit runs report missing rooms", () => {
  assert(plan([], {}).jobs.every((job) => !job.setup));
  const { jobs } = plan(["online"], {});
  assert.match(jobs[0].blocked, /ROOM_ID/);
  assert.equal(plan(["online"], { ROOM_ID: "room" }).jobs[0].blocked, null);
});

test("headless viewport and account/host overrides reach Maestro as separate arguments", () => {
  const { jobs } = plan(["story", "--headless", "--screen-size", "375x812"], {
    WEB_URL: "http://localhost:8090", TEST_USER_EMAIL: "second@example.com", TEST_USER_PASSWORD: "test password",
  });
  assert(jobs[0].args.includes("375x812"));
  assert(jobs[0].args.includes("WEB_URL=http://localhost:8090"));
  assert(jobs[0].args.includes("TEST_USER_PASSWORD=test password"));
});

test("invalid options and unsupported platform coverage fail before running anything", () => {
  for (const args of [["unknown"], ["wild", "--platform", "ios"], ["--platform", "typo"],
    ["--timeout", "0"], ["--platform", "android", "--headless"]]) {
    assert.throws(() => plan(args, {}));
  }
});

test("suite preserves pass/fail/blocked evidence and returns failure if any feature fails", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(resolve(tmpdir(), "wordpoker-smoke-test-"));
  const maestro = resolve(directory, "maestro");
  writeFileSync(maestro, `#!${process.execPath}\nconsole.log('fake Maestro evidence');\nprocess.exit(process.argv.some(arg => arg.endsWith('/story.yaml')) ? 1 : 0);\n`);
  chmodSync(maestro, 0o755);
  const output = resolve(directory, "reports");
  assert.equal(main(["auth", "story", "online", "--output", output], { ...process.env, MAESTRO_BIN: maestro, ROOM_ID: "" }), 1);
  // Each invocation has exactly one timestamped report directory.
  // Discover the report through stdout-independent filesystem traversal.
  const reports = readReports(output);
  assert.equal(reports.complete, true);
  assert.deepEqual(reports.planned, ["auth", "story", "online"]);
  assert.deepEqual(reports.results.map((row) => row.status), ["PASS", "FAIL", "BLOCKED"]);
});

test("missing Maestro produces an error report and a failing exit code", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "wordpoker-smoke-missing-"));
  assert.equal(main(["auth", "--output", directory], { ...process.env, MAESTRO_BIN: resolve(directory, "missing-maestro") }), 1);
  const { results } = readReports(directory);
  assert.notEqual(results[0].status, "PASS");
});

test("a hung Maestro times out and preserves error evidence", { skip: process.platform === "win32" }, () => {
  const directory = mkdtempSync(resolve(tmpdir(), "wordpoker-smoke-timeout-"));
  const maestro = resolve(directory, "maestro");
  writeFileSync(maestro, `#!${process.execPath}\nsetInterval(() => {}, 1000);\n`);
  chmodSync(maestro, 0o755);
  const output = resolve(directory, "reports");
  assert.equal(main(["auth", "--timeout", "100", "--output", output], { ...process.env, MAESTRO_BIN: maestro }), 1);
  assert.equal(readReports(output).results[0].status, "ERROR");
  assert.match(readReports(output).results[0].detail, /ETIMEDOUT/);
});

function readReports(output) {
  const [run] = readdirSync(output);
  return JSON.parse(readFileSync(resolve(output, run, "results.json"), "utf8"));
}
