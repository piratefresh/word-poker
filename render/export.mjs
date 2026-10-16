import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// First-time browser setup after installing dependencies: pnpm exec playwright install chromium
// PNGs stay beside the renderer; the existing game background is untouched.
const OUTPUT = new URL("./", import.meta.url);
const WIDTH = 1584;
const HEIGHT = 2816;
const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.goto(new URL("felt.html", OUTPUT).href);
  await page.evaluate(() => window.renderReady);
  for (const scale of [1, 0.5]) {
    const width = WIDTH * scale;
    const height = HEIGHT * scale;
    await page.setViewportSize({ width, height });
    await page.evaluate(({ width, height }) => {
      for (const el of [document.documentElement, document.body, document.querySelector("canvas")]) {
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
      }
    }, { width, height });
    const name = `tabletop-felt-portrait${scale === 1 ? "" : "@0.5x"}.png`;
    const output = fileURLToPath(new URL(name, OUTPUT));
    await page.screenshot({ path: output, fullPage: true, type: "png" });
    // Check the actual PNG header, including accidental scroll/scale changes.
    const png = await readFile(output);
    assert.equal(png.readUInt32BE(16), width, `${name}: width`);
    assert.equal(png.readUInt32BE(20), height, `${name}: height`);
    console.log(`${output} (${width}×${height})`);
  }
} finally {
  await browser.close();
}
