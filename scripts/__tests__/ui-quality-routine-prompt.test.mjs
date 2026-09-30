/**
 * The `mbe-ui-quality` routine prompt (docs/routines/mbe-ui-quality.md) is the
 * one unattended caller of every `scripts/ui-quality/` CLI
 * (docs/features/ui-quality-loop/architecture.md § Components "Routine"). A
 * prompt that names a subcommand the CLI dropped, forgets a required flag, or
 * runs two steps out of order fails silently at 12:23am in a sandbox nobody
 * watches — so this test pins every invocation against the CLI's own usage
 * text and every ordering the architecture's Routine steps (0)–(7) depend on.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTINE_MANIFEST, parseRoutineCatalog } from "../routine-manifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DOC_PATH = join(ROOT, "docs/routines/mbe-ui-quality.md");
const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

const fence = /```text\n([\s\S]*?)\n```/.exec(doc);
const block = fence ? fence[1] : "";

const frontmatter = Object.fromEntries(
  (/^---\n([\s\S]*?)\n---/.exec(doc)?.[1] ?? "")
    .split("\n")
    .map((line) => /^([a-z_]+):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")])
);

/**
 * Every `node scripts/ui-quality/<file>.mjs [<sub>] [args…]` in the block, in
 * order. The invocation's text runs to the closing backtick or end of line.
 */
const INVOCATION = /node scripts\/ui-quality\/([a-z0-9-]+)\.mjs((?:[ \t]+[^`\n]*)?)/g;
const invocations = [...block.matchAll(INVOCATION)].map((m) => {
  const rest = m[2].trim();
  const first = rest.split(/\s+/)[0] ?? "";
  const sub = /^[a-z][a-z-]*$/.test(first) ? first : null;
  return { file: m[1], sub, text: m[0], args: rest, index: m.index };
});

const of = (file, sub) => invocations.filter((i) => i.file === file && i.sub === sub);

/** The CLI's `Usage:` line: `<a|b [--x]|c>` → [a, b, c]; a bare word → [word]; flags only → []. */
function usageSubcommands(file) {
  const source = readFileSync(join(ROOT, "scripts/ui-quality", `${file}.mjs`), "utf8");
  const usage = /Usage: node scripts\/ui-quality\/[a-z0-9-]+\.mjs ([^\n]*)/.exec(source);
  if (!usage) throw new Error(`${file}.mjs has no Usage line`);
  const alternation = /^<([^>]+)>/.exec(usage[1]);
  if (alternation) return alternation[1].split("|").map((alt) => alt.trim().split(/\s+/)[0]);
  const bare = /^([a-z][a-z-]*)\b/.exec(usage[1]);
  return bare ? [bare[1]] : [];
}

describe("docs/routines/mbe-ui-quality.md", () => {
  it("exists with house frontmatter and a fenced text prompt", () => {
    expect(doc).not.toBe("");
    expect(frontmatter).toMatchObject({
      trigger_id: "pending",
      environment_id: "env_012GDG167Tpz55u8MEpDkL2y",
      cron: "23 7 * * *",
      model: "claude-opus-5",
      cadence: "Daily 12:23am PT",
    });
    expect(block.length).toBeGreaterThan(0);
  });

  it("invokes every scripts/ui-quality CLI by a file that exists and a subcommand its usage lists", () => {
    expect(invocations.length).toBeGreaterThan(0);
    for (const inv of invocations) {
      const path = join(ROOT, "scripts/ui-quality", `${inv.file}.mjs`);
      expect(existsSync(path), `${inv.text}: no such file`).toBe(true);
      const subs = usageSubcommands(inv.file);
      if (subs.length === 0) {
        expect(inv.sub, `${inv.text}: ${inv.file}.mjs takes no subcommand`).toBeNull();
      } else {
        expect(subs, `${inv.text}: subcommand not in ${inv.file}.mjs usage`).toContain(inv.sub);
      }
      const source = readFileSync(path, "utf8");
      for (const flag of inv.args.match(/--[a-z][a-z-]*/g) ?? []) {
        expect(source, `${inv.text}: ${flag} unknown to ${inv.file}.mjs`).toContain(flag);
      }
    }
  });

  it("covers every CLI the routine drives", () => {
    const pairs = new Set(invocations.map((i) => `${i.file} ${i.sub ?? ""}`.trim()));
    for (const expected of [
      "ledger refresh",
      "ledger due",
      "ledger record",
      "browser resolve",
      "detect mechanical",
      "detect judged",
      "rate calibration-status",
      "rate pairs",
      "rate calibrate",
      "rate record",
      "findings migrate",
      "findings plan",
      "findings record",
      "findings seeds",
      "p1-age",
      "coverage",
    ]) {
      expect(pairs, expected).toContain(expected);
    }
  });

  it("runs the three capture configs", () => {
    for (const app of ["marketing", "rialto-web", "hospitality"]) {
      expect(block).toMatch(
        new RegExp(
          `pnpm --dir apps/${app} exec playwright test --config playwright\\.ui-quality\\.config\\.ts`
        )
      );
    }
  });

  it("invokes both detect.mjs subcommands and never a bare detect.mjs", () => {
    expect(of("detect", "mechanical").length).toBeGreaterThan(0);
    expect(of("detect", "judged").length).toBeGreaterThan(0);
    expect(invocations.filter((i) => i.file === "detect" && i.sub === null)).toEqual([]);
  });

  it("runs detect.mjs judged after the judged files are written and before findings.mjs plan", () => {
    const writes = block.indexOf(".ui-quality/judged/<app>.json");
    const judged = of("detect", "judged")[0].index;
    const plan = of("findings", "plan")[0].index;
    expect(writes).toBeGreaterThan(-1);
    expect(writes).toBeLessThan(judged);
    expect(judged).toBeLessThan(plan);
  });

  it("passes findings.mjs plan both detector outputs and the fire's calibration stamp", () => {
    for (const plan of of("findings", "plan")) {
      expect(plan.args).toContain("--findings .ui-quality/findings.mechanical.json");
      expect(plan.args).toContain("--findings .ui-quality/findings.judged.json");
      expect(plan.args).toContain("--calibration-status");
      expect(plan.args).toContain("--issue-states");
    }
  });

  it('names unjudged: "tool-error" for an unreadable image', () => {
    expect(block).toContain('unjudged: "tool-error"');
  });

  it("ends on ledger.mjs record with no --rubric-version", () => {
    const last = invocations[invocations.length - 1];
    expect(`${last.file} ${last.sub}`).toBe("ledger record");
    expect(block).not.toContain("--rubric-version");
  });

  it("passes --model-id to every rate.mjs record, calibrate and calibration-status", () => {
    for (const sub of ["record", "calibrate", "calibration-status"]) {
      const calls = of("rate", sub);
      expect(calls.length, sub).toBeGreaterThan(0);
      for (const call of calls) expect(call.args, call.text).toContain("--model-id");
    }
    for (const sub of ["record", "calibrate"]) {
      for (const call of of("rate", sub)) expect(call.args, call.text).toContain("--verdicts");
    }
  });

  it("orders calibration-status → pairs --calibration → calibrate → calibration-status → pairs", () => {
    const status = of("rate", "calibration-status");
    const pairs = of("rate", "pairs");
    const calibrationPairs = pairs.filter((p) => p.args.includes("--calibration"));
    const plainPairs = pairs.filter((p) => !p.args.includes("--calibration"));
    expect(status.length).toBeGreaterThanOrEqual(2);
    expect(calibrationPairs.length).toBeGreaterThan(0);
    expect(plainPairs.length).toBeGreaterThan(0);
    const calibrate = of("rate", "calibrate")[0].index;
    expect(status[0].index).toBeLessThan(calibrationPairs[0].index);
    expect(calibrationPairs[0].index).toBeLessThan(calibrate);
    expect(calibrate).toBeLessThan(status[1].index);
    expect(status[1].index).toBeLessThan(plainPairs[0].index);
  });

  it("makes exit 3 (stale) the only calibration trigger and never re-runs a failed key", () => {
    expect(block).toMatch(/exit 3 \(`stale`\) is the ONLY calibration trigger/);
    const failed = block.split(/(?<=\.)\s+/).find((sentence) => /exit 1 \(`failed`/.test(sentence));
    expect(failed).toBeDefined();
    expect(failed).toContain("rate.mjs pairs");
    expect(failed).toContain("rate.mjs record");
    expect(failed).toMatch(/never re-run/);
  });

  it("stamps escalated_at through findings.mjs record after p1-age.mjs --escalate", () => {
    const escalate = invocations.find((i) => i.file === "p1-age" && i.args.includes("--escalate"));
    expect(escalate).toBeDefined();
    const writeBack = of("findings", "record").find(
      (i) => i.args.includes("escalated") && i.index > escalate.index
    );
    expect(writeBack).toBeDefined();
    expect(block).toContain('{ "actions": [], "escalated": [');
  });

  it("migrates before planning and comment-and-closes retired-tell issues", () => {
    expect(of("findings", "migrate")[0].index).toBeLessThan(of("findings", "plan")[0].index);
    expect(block).toMatch(/retired/);
    expect(block).toMatch(/state_reason: "not_planned"/);
  });

  it("never uses gh or the live site", () => {
    expect(block).not.toMatch(/\bgh\s/);
    expect(block).not.toMatch(/mattbutlerengineering\.com/);
  });

  it("names a ledger PR title the manifest signature matches", () => {
    const title = /`(chore\(ui-quality\): ledger <YYYY-MM-DD>)`/.exec(block);
    expect(title).not.toBeNull();
    const entry = ROUTINE_MANIFEST.find((e) => e.name === "mbe-ui-quality");
    expect(entry).toBeDefined();
    expect(entry.periodDays).toBe(1);
    expect(entry.activatedAt).toBeUndefined();
    expect(entry.signature.type).toBe("pr-title");
    const concrete = title[1].replace("<YYYY-MM-DD>", "2026-10-01");
    expect(new RegExp(entry.signature.pattern).test(concrete)).toBe(true);
    expect(concrete).toContain(entry.signature.searchTerm);
  });
});

describe("docs/scheduled-tasks.md — mbe-ui-quality", () => {
  const catalog = readFileSync(join(ROOT, "docs/scheduled-tasks.md"), "utf8");

  it("catalogues the routine with a pending trigger and its prompt file", () => {
    expect(parseRoutineCatalog(catalog)).toContainEqual({
      name: "mbe-ui-quality",
      triggerId: "pending",
    });
    const row = catalog.split("\n").find((line) => line.startsWith("| `mbe-ui-quality`"));
    expect(row).toContain("routines/mbe-ui-quality.md");
    expect(row).toContain("`23 7 * * *`");
    expect(row).toContain("**opus**");
  });

  it("counts it in the daily plan budget (6 → 7)", () => {
    expect(catalog).toMatch(/The \*\*daily\*\* baseline is 7 runs/);
    expect(catalog).toMatch(/`mbe-ui-quality`/);
  });
});
