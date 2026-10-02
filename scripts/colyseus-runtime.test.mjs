import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

// Each process imports the real SDK afresh, as Metro does on app startup.
for (const moduleType of ["commonjs", "module"]) {
  for (const finalizationRegistry of ["missing", "native"]) {
    test(`Colyseus ${moduleType} works with ${finalizationRegistry} FinalizationRegistry`, () => {
      const load = moduleType === "commonjs"
        ? 'const sdk = require("@colyseus/sdk"); const schemaModule = require("@colyseus/schema");'
        : 'const sdk = await import("@colyseus/sdk"); const schemaModule = await import("@colyseus/schema");';
      const result = spawnSync(process.execPath, [
        `--input-type=${moduleType}`,
        "-e",
        `
          // Initialize Node's fetch implementation before removing the API.
          // React Native supplies its own fetch and FormData implementation.
          new FormData();
          ${finalizationRegistry === "missing" ? "delete globalThis.FinalizationRegistry;" : ""}
          ${load}
          const { schema, t, Encoder, Decoder, StateView } = schemaModule;
          const State = schema({ score: t.number() }, "RuntimeState");
          const source = new State({ score: 7 });
          const encoder = new Encoder(source);
          const target = new State();
          const decoder = new Decoder(target);
          decoder.decode(encoder.encodeAll());
          if (target.score !== 7) throw new Error("Initial state did not decode");
          encoder.discardChanges();
          source.score = 11;
          decoder.decode(encoder.encode());
          if (target.score !== 11) throw new Error("State patch did not decode");
          const view = new StateView();
          view.add(source);
          if (view.id < 0) throw new Error("View was not registered");
          view.dispose();
          if (view.id !== -1) throw new Error("View was not disposed");
          const client = new sdk.Client("ws://localhost:2567");
          if (!client) throw new Error("SDK client did not initialize");
        `,
      ], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });
  }
}
