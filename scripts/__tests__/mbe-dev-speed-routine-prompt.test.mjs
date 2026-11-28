/**
 * The `mbe-dev-speed` routine prompt (docs/routines/mbe-dev-speed.md) is the one
 * unattended caller of scripts/dev-speed-report.mjs and the only writer of the
 * ledger issue. A prompt that drifts back to hand arithmetic (#10113), loses the
 * ledger, or hands a PR to the merge workflow while a deploy is stuck (#9948)
 * fails silently in a sandbox nobody watches, so this test pins those rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const doc = read("docs/routines/mbe-dev-speed.md");
const block = /```text\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? "";
const frontmatter = Object.fromEntries(
  (/^---\n([\s\S]*?)\n---/.exec(doc)?.[1] ?? "")
    .split("\n")
    .map((line) => /^([a-z_]+):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")])
);
const LEDGER_ISSUE = 10180;

describe("docs/routines/mbe-dev-speed.md", () => {
  it("documents the hourly cadence the live trigger runs on", () => {
    expect(frontmatter).toMatchObject({
      trigger_id: "trig_01VrmRCQDPuMKjcrbuP7sj2t",
      cron: "57 * * * *",
    });
    expect(JSON.parse(read("scripts/routines/mbe-dev-speed.json")).periodDays).toBe(1);
    expect(read("docs/scheduled-tasks.md")).toContain("hourly at :57 (`57 * * * *`");
  });

  it("measures with the script's flags, never the newest-N window", () => {
    expect(block).toContain("node scripts/dev-speed-report.mjs --days 7 --json");
    expect(block).toContain("node scripts/dev-speed-report.mjs --since");
    expect(block).not.toMatch(/15 newest/);
    const script = read("scripts/dev-speed-report.mjs");
    for (const flag of ["--days", "--json", "--since", "--job", "--control"]) {
      expect(block, `prompt uses ${flag}`).toContain(flag);
      expect(script, `script reads ${flag}`).toContain(`"${flag}"`);
    }
  });

  it("reads and rewrites the ledger issue on every fire", () => {
    expect(block).toContain(`issues/${LEDGER_ISSUE} --jq .body`);
    expect(block).toContain(
      `-X PATCH repos/mattbutlerengineering/mattbutlerengineering/issues/${LEDGER_ISSUE}`
    );
    expect(block).toContain("<!-- mbe-dev-speed-ledger v1 -->");
    expect(block).toContain("## Current bottlenecks");
    expect(block).toContain("## Changes tried");
    expect(block.indexOf("LEDGER WRITE —")).toBeLessThan(block.indexOf("FINAL STEP —"));
    expect(block).toMatch(
      /LEDGER WRITE — on every fire, including `noop`, WIP-cap and `error` fires/
    );
  });

  it("scores a change only after 20 post-merge runs, against a control job", () => {
    expect(block).toContain("pending (<runs>/20)");
    expect(block).toMatch(
      /`helped` when the target fell 10% or more and the control moved less than 10%/
    );
    expect(block).toMatch(/run time, never wall time/);
  });

  it("opens pull requests, not issues, including a revert for a slower change", () => {
    expect(block).toContain("open a revert PR (`git revert` of its merge commit)");
    expect(block).toContain("open a DRAFT PR with the first working slice");
    expect(block).toContain("File an issue only when the next step is the Owner's alone");
    expect(block).not.toMatch(/file a `ready` issue/);
  });

  it("holds the merge hand-off while main is red or a deploy is undeployed", () => {
    const hold = block.indexOf("check the hand-off hold");
    const handOff = block.indexOf("When the hold is clear");
    expect(hold).toBeGreaterThan(-1);
    expect(handOff).toBeGreaterThan(hold);
    expect(block).toContain("`deploys.undeployed` is above 0, do NOT post `reviewed-merge:`");
    expect(block).toContain("Never call the merge endpoint and never enable auto-merge yourself.");
  });

  it("keeps the brakes: WIP cap, backlog rule and the never-a-speed-up list", () => {
    expect(block).toContain("If two or more are open, open no new PR this fire.");
    expect(block).toContain("if `backlog.medianQueueMin` is over 15, open no PR this fire");
    for (const banned of [
      "skipping, deleting or `.only`-ing tests",
      "raising a timeout",
      "making a required check advisory",
      "adding `continue-on-error`",
    ]) {
      expect(block).toContain(banned);
    }
    expect(block).toContain("<!-- mbe-automation -->");
  });
});
