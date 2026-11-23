/**
 * Records real gameplay for the trailer from Expo web (localhost:8081), at a 9:16 phone viewport.
 * Replays the pinned-seed hands the Maestro smokes play (.maestro/offline-hand.yaml,
 * .maestro/offline-wild-power.yaml), so every take shows the same hand.
 *
 *   node marketing/trailer/capture/record.mjs [classic|wild]...
 *
 * Signs in as the seeded E2E user (scripts/seed-test-user.mjs). Clips land in
 * marketing/trailer/public/footage/<name>.webm.
 */
import { chromium } from "playwright";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../..");
const OUT = path.resolve(HERE, "../public/footage");
const WEB = process.env.WEB_URL ?? "http://localhost:8081";
const VIEWPORT = { width: 432, height: 768 };
const SCALE = 2.5; // 1080 × 1920

const seed = await readFile(path.join(ROOT, "scripts/seed-test-user.mjs"), "utf8");
const EMAIL = process.env.TEST_USER_EMAIL ?? "e2e@wordpoker.dev";
const PASSWORD = process.env.TEST_USER_PASSWORD ?? seed.match(/TEST_USER_PASSWORD \?\? "([^"]+)"/)[1];

const browser = await chromium.launch({ channel: "chrome", headless: true });

async function signIn() {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  await page.goto(`${WEB}/sign-in`);
  await page.getByText(/Offline|TAKE YOUR SEAT/).first().waitFor({ timeout: 60_000 });
  if (await page.getByText("TAKE YOUR SEAT").count()) {
    await page.getByPlaceholder(/you@mail.com or HANDLE/i).fill(EMAIL);
    await page.locator('[id="Password"], [aria-label="Password"]').first().fill(PASSWORD);
    await page.getByText("TAKE YOUR SEAT").click();
    await page.getByText("Offline").first().waitFor({ timeout: 60_000 });
  }
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

// A test id is the DOM id where the app sets one (webTestID), else React Native web's data-testid.
const byId = (page, id) => page.locator(`[id="${id}"], [data-testid="${id}"]`).first();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Taps the hero's check/call whenever it is the hero's turn, until `until` shows. */
async function walk(page, until, maxMs = 120_000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    if (await page.getByText(until).first().isVisible().catch(() => false)) return;
    if (await page.getByText("YOUR TURN").first().isVisible().catch(() => false)) {
      await byId(page, "action-check-call").click().catch(() => {});
      await sleep(900);
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${until}`);
}

const CLIPS = {
  async classic(page) {
    await page.goto(`${WEB}/offline?seed=371&turn=300000`);
    await page.getByText(/PREFLOP( [1-5]\/5)?/).first().waitFor({ timeout: 90_000 });
    await walk(page, /RIVER( [1-5]\/5)?/);
    await page.getByText("YOUR TURN").first().waitFor({ timeout: 20_000 });
    await sleep(600);
    await byId(page, "action-raise").click();
    await sleep(500);
    await page.getByText("MIN", { exact: true }).click();
    await sleep(700);
    await byId(page, "action-wager").click();
    await byId(page, "action-check-call").filter({ hasText: "$500" }).waitFor({ timeout: 20_000 });
    await sleep(800);
    for (const t of ["H-1", "E-3", "M-2", "P-2"]) {
      await byId(page, `word-builder-tile-${t}`).click();
      await sleep(550);
    }
    await sleep(900);
    await byId(page, "action-check-call").click(); // call
    await page.getByText("SUBMIT WORD").first().waitFor({ timeout: 20_000 });
    await sleep(1200);
    await byId(page, "action-check-call").click(); // submit
    await page.getByText("CONTINUE", { exact: true }).first().waitFor({ timeout: 60_000 });
    await sleep(2500);
    await page.getByText("CONTINUE", { exact: true }).first().click();
    await page.getByText(/HAND #1 · RESULTS/).first().waitFor({ timeout: 30_000 });
    await sleep(6000);
  },
  async wild(page) {
    await page.goto(`${WEB}/offline?seed=178&powers=wild`);
    await byId(page, "power-offer-vowel_magnet").waitFor({ timeout: 90_000 });
    await byId(page, "power-draw-ready").waitFor({ timeout: 5_000 });
    await sleep(700);
    // The cards take no tap until the row has landed; retry until the card opens to read.
    for (let i = 0; i < 12 && !(await byId(page, "power-draw-confirm").isVisible().catch(() => false)); i++) {
      await byId(page, "power-offer-vowel_magnet").click({ force: true, timeout: 1000 }).catch(() => {});
      await sleep(500);
    }
    await sleep(900);
    await byId(page, "power-draw-confirm").click({ timeout: 5000 });
    await byId(page, "action-check-call").filter({ hasText: "$60" }).waitFor({ timeout: 20_000 });
    await sleep(600);
    await byId(page, "power-held").click();
    await sleep(700);
    await byId(page, "word-builder-tile-H-2").click({ force: true });
    await sleep(900);
    await byId(page, "power-confirm").click({ force: true });
    await byId(page, "word-builder-tile-power-0").waitFor({ timeout: 10_000 });
    await sleep(1800);
    await byId(page, "word-builder-tile-M-1").click();
    await sleep(500);
    await byId(page, "word-builder-tile-power-0").click();
    await sleep(2500);
  },
  /** Needs `node scripts/friends-social-fixture.mjs` running: one friend at a table, one just seen. */
  async social(page) {
    await page.goto(`${WEB}/`);
    await page.getByText("Offline").first().waitFor({ timeout: 60_000 });
    await sleep(1500);
    await byId(page, "tab-friends").click();
    await byId(page, "friends-tab-all").waitFor({ timeout: 30_000 });
    await byId(page, "friends-tab-all").click();
    await page.locator('[id^="friend-join-"], [data-testid^="friend-join-"]').first().waitFor({ timeout: 30_000 });
    await sleep(2500);
    await page.locator('[id^="friend-nudge-"], [data-testid^="friend-nudge-"]').first().click();
    await sleep(3000);
  },
  /** The lobby's mode chips and the new-table form; it never creates a table. */
  async lobby(page) {
    await page.goto(`${WEB}/online`);
    await page.getByText(/DEAL A NEW TABLE/).first().waitFor({ timeout: 60_000 });
    await sleep(1500);
    await page.getByText("Wild Power", { exact: true }).first().click();
    await sleep(1500);
    await page.getByText(/DEAL A NEW TABLE/).first().click();
    await page.getByText(/CREATE · /).first().waitFor({ timeout: 15_000 });
    await sleep(1200);
    await byId(page, "create-table-power-ups").scrollIntoViewIfNeeded();
    await sleep(2500);
    await page.getByText("Cancel", { exact: true }).first().click();
    await sleep(800);
  },
  async story(page) {
    await page.goto(`${WEB}/story`);
    await byId(page, "story-map").waitFor({ timeout: 60_000 });
    await sleep(2500);
    const first = page.locator('[aria-label^="First Hand,"], [id^="First Hand,"]').first();
    await first.scrollIntoViewIfNeeded();
    await sleep(800);
    await first.click();
    await byId(page, "story-deal").waitFor({ timeout: 15_000 });
    await sleep(2500);
    await byId(page, "story-deal").click();
    await byId(page, "poker-table").waitFor({ timeout: 90_000 });
    await sleep(5000);
  },
  async quests(page) {
    await page.goto(`${WEB}/`);
    await page.getByText("Offline").first().waitFor({ timeout: 60_000 });
    await sleep(1000);
    await page.locator('[aria-label^="Level "], [id^="Level "]').first().click();
    await byId(page, "quest-wallet").waitFor({ timeout: 30_000 });
    await sleep(2500);
    await page.mouse.wheel(0, 700);
    await sleep(2500);
    await page.goto(`${WEB}/`);
    await byId(page, "tab-store").click();
    await byId(page, "store-daily-bonus").waitFor({ timeout: 30_000 });
    await sleep(2500);
    await byId(page, "store-tab-tiles").click();
    await sleep(3000);
  },
};

await mkdir(OUT, { recursive: true });
const state = await signIn();
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CLIPS);
for (const name of names) {
  const tmp = path.join(OUT, `.tmp-${name}`);
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    storageState: state,
    recordVideo: { dir: tmp, size: { width: 1080, height: 1920 } },
  });
  const page = await ctx.newPage();
  const started = Date.now();
  try {
    await CLIPS[name](page);
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, `${name}-failed.png`) });
    console.error(`${name}: ${e.message}`);
  }
  const video = page.video();
  await ctx.close();
  await rename(await video.path(), path.join(OUT, `${name}.webm`));
  await rm(tmp, { recursive: true, force: true });
  console.log(`${name}: ${Math.round((Date.now() - started) / 1000)}s → public/footage/${name}.webm`);
}
await browser.close();
