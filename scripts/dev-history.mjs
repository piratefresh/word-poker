import { spawn } from "node:child_process";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("apps/mobile/.env needs DATABASE_URL for history.");
const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: resolve("apps/server"), stdio: "inherit",
  env: {
    ...process.env,
    AUTH_API_URL: "http://localhost:8081",
    WORDPOKER_HISTORY_DATABASE_URL: process.env.DATABASE_URL,
    WORDPOKER_HISTORY_JOURNAL_DIR: resolve(".history-settlements"),
  },
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
