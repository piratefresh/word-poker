import { it } from "node:test";
import { writeFileSync } from "node:fs";
import { chooseBotPower } from "../src/bot/bot-power";
import { startHand } from "../src/table/offline";
import { testDictionary } from "./fixtures";

it("probe", () => {
  const out = [62, 16, 127].map((seed) => {
    const state = startHand({ seed, players: ["hero", "ellis", "jay", "mira"], nowMs: 1_000_000, dictionary: testDictionary(["AT", "QI", "RAT", "STAR"]), powerUps: { deal: "choose3" } });
    return seed + ":" + ["ellis", "jay", "mira"].map((id) => chooseBotPower(state, id)).join(",");
  });
  writeFileSync("C:/WINDOWS/TEMP/claude/e--WebStuff-word-poker/4694acb3-3d41-49cc-b100-4cf479096305/scratchpad/probe.txt", out.join(" | "));
});
