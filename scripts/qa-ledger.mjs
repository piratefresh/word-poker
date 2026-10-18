// Start Expo with EXPO_PUBLIC_AUTH_URL pointing at the same port as LEDGER_URL.
// Uses the shared E2E account; fixtures stay in each disposable browser's IndexedDB.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const baseURL = process.env.LEDGER_URL ?? "http://localhost:8081";
const password = process.env.TEST_USER_PASSWORD;
assert(password, "Set TEST_USER_PASSWORD to the shared E2E user's password (see .maestro/sign-in.yaml).");
const output = new URL("../.tmp/ledger-qa/", import.meta.url);
await mkdir(output, { recursive: true });

for (const [engine, browserType] of Object.entries({ chromium, webkit })) {
  const browser = await browserType.launch();
  try {
    for (const width of [1280, 375]) for (const reducedMotion of ["no-preference", "reduce"]) {
      const context = await browser.newContext({ baseURL, viewport: { width, height: 812 }, reducedMotion });
      try {
        const auth = await context.request.post("/api/auth/sign-in/email", {
          data: { email: process.env.TEST_USER_EMAIL ?? "e2e@wordpoker.dev", password },
        });
        assert(auth.ok(), `Test login failed (${auth.status()})`);
        const { user } = await auth.json();
        // Do not read, upload or alter server history during a fixture run.
        await context.route("**/api/history/**", (route) => route.fulfill({
          json: { hands: [], cursor: null, hasMore: false },
        }));
        const page = await context.newPage();
        await page.goto("/");
        await page.getByTestId("tab-history").waitFor();
        await page.evaluate(async (owner) => {
          const request = indexedDB.open("wordpoker-history", 1);
          const db = await new Promise((resolve, reject) => {
            request.onupgradeneeded = () => {
              request.result.createObjectStore("hands", { keyPath: "key" }).createIndex("owner", "owner");
              request.result.createObjectStore("cursors");
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const tx = db.transaction("hands", "readwrite");
          const store = tx.objectStore("hands");
          const now = Date.now();
          for (let session = 0; session < 500; session++) for (let no = 1; no <= (session === 0 ? 200 : 1); no++) {
            const sessionId = `qa-ledger-${session}`;
            const id = `${sessionId}:${no}`;
            const hand = {
              id, sessionId, handNo: no, mode: "online", ranked: true, tableName: `QA session ${session}`,
              heroId: "hero", dictionaryId: "en_US-large", startedAtMs: now - session * 1000000 + no * 1000,
              endedAtMs: now - session * 1000000 + no * 1000 + 100,
              seats: [{ playerId: "hero", name: "You", initialStack: 1000 }, { playerId: "mira", name: "Mira", initialStack: 1000 }],
              actions: [],
              summary: { outcome: "showdown", community: [], pots: [{ amount: 40, eligible: ["hero", "mira"], winners: ["hero"] }],
                seats: [
                  { playerId: "hero", privateTiles: [], word: "AARDVARKS", score: 37, submission: null, reason: null, place: 1, finalStack: 1020 },
                  { playerId: "mira", privateTiles: [], word: null, score: 0, submission: null, reason: null, place: null, finalStack: 980 },
                ] },
            };
            store.put({ key: `${owner}:${id}`, owner, row: { hand, status: "synced", record: null, error: null, attempts: 0, retryAtMs: 0 } });
          }
          await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
          db.close();
        }, user.id);
        await page.reload();
        await page.getByTestId("tab-history").click();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Hand ledger");
        assert(await page.getByTestId("ledger-home").getAttribute("aria-hidden") === "true");
        await page.keyboard.press("Tab");
        assert(await page.evaluate(() => document.activeElement?.getAttribute("data-testid")) === "history-sync");
        const session = page.getByTestId("history-session-qa-ledger-0");
        await session.click();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Back to sessions");
        await page.getByTestId("history-hand-200").click();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Back to hands");
        assert(await page.getByText("HAND #200", { exact: true }).isVisible());
        assert(!(await page.getByTestId("ledger-home").getByRole("button", { name: "Offline", exact: true }).isVisible()) ||
          await page.getByTestId("ledger-home").getAttribute("aria-hidden") === "true");
        await page.screenshot({ path: fileURLToPath(new URL(`${engine}-${width}-${reducedMotion}-detail.png`, output)) });
        await page.goBack();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Back to sessions");
        await page.getByTestId("history-back-sessions").click();
        await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Hand ledger");
        await page.getByTestId("tab-home").click();
        await page.waitForFunction(() => document.querySelector('[data-testid="ledger-book"]')?.getAttribute("aria-hidden") === "true");
        await page.getByRole("button", { name: "Offline", exact: true }).waitFor();
        console.log(`PASS ${engine} ${width}px ${reducedMotion}: open, both turns, focus, browser Back, close; 500 sessions / 200 hands seeded`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
