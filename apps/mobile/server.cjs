/**
 * server.cjs — serves the web export (`expo export --platform web`) on Node: the static pages
 * from dist/client, and the API routes (auth, wallet, store, RevenueCat webhook) from
 * dist/server. This is what runs on Railway; locally, `expo start` does the same job.
 *
 * CommonJS because expo-server's ESM build uses extensionless imports Node's loader rejects.
 */
const path = require("node:path");

const express = require("express");
const { createRequestHandler } = require("expo-server/adapter/express");

const dist = path.join(__dirname, "dist");
const app = express();

app.disable("x-powered-by");
app.use(express.static(path.join(dist, "client")));
app.use(createRequestHandler({ build: path.join(dist, "server"), environment: process.env.NODE_ENV }));

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Word Poker web + API on :${port}`));
