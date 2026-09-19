#!/usr/bin/env node
/**
 * Builds the deployable server: one bundled `build/index.js`.
 *
 * `tsc` on its own cannot produce a runnable artifact here. The shared packages are
 * consumed as TypeScript source (AGENTS.md), so the emitted `import "@wordpoker/contracts"`
 * would be handed to Node, which cannot load `.ts` from a package — it fails resolving the
 * package's own extensionless imports (`./phases`). Pointing the package at a build output
 * instead would put the app (source) and the server (build) on two copies of the rules,
 * which is the one thing this workspace must not do.
 *
 * Bundling inlines the workspace packages into the artifact. Everything the server
 * declares as a runtime dependency stays external and is resolved from node_modules.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

await build({
  absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
  entryPoints: ["src/index.ts"],
  outfile: "build/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: Object.keys(manifest.dependencies ?? {}).filter(
    (name) => !name.startsWith("@wordpoker/"),
  ),
  logLevel: "info",
});
