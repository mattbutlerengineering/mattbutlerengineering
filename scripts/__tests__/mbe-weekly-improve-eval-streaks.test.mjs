/**
 * The `mbe-weekly-improve` routine prompt (docs/routines/mbe-weekly-improve.md)
 * is the one unattended caller of scripts/eval-task-streaks.mjs (#10214). The
 * weekly eval checkpoint alarms on a suite-score change, which cannot see a
 * task that fails every run (#10139); a prompt that drops the streak check, or
 * reads "no data" as "no streaks", fails silently in a sandbox nobody watches.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(join(ROOT, path), "utf8");
const block =
  /```text\n([\s\S]*?)\n```/.exec(read("docs/routines/mbe-weekly-improve.md"))?.[1] ?? "";
const script = read("scripts/eval-task-streaks.mjs");
const INVOCATION = "node scripts/eval-task-streaks.mjs";
const step = block.split("\n").find((line) => line.includes(INVOCATION)) ?? "";

describe("docs/routines/mbe-weekly-improve.md runs the eval task-streak check", () => {
  it("invokes the script the way it really reads its arguments", () => {
    expect(step).toContain(`\`${INVOCATION}\``);
    // The script takes one optional positional path and no flags.
    expect(script).toContain("argv[2] ?? DEFAULT_HISTORY");
    expect(script).not.toMatch(/["'`]--[a-z]/);
    expect(block).not.toMatch(/eval-task-streaks\.mjs`? --/);
    expect(script).toContain('const DEFAULT_HISTORY = ".metrics-data/eval-reports.jsonl"');
    expect(step).toContain(".metrics-data/eval-reports.jsonl");
  });

  it("sits after the weekly eval checkpoint and before the log step", () => {
    const checkpoint = block.indexOf("4. Weekly eval checkpoint");
    const streaks = block.indexOf(INVOCATION);
    const report = block.indexOf("\n5. Append a dated entry");
    expect(checkpoint).toBeGreaterThan(-1);
    expect(streaks).toBeGreaterThan(checkpoint);
    expect(report).toBeGreaterThan(streaks);
    expect(step).toMatch(/whatever (its|step 4's) exit code/);
  });

  it("acts on the exit codes the script really sets", () => {
    expect(script).toContain("{ ok: 0, alarm: 1, undeterminable: 2 }");
    for (const code of ["**Exit 0**", "**Exit 1**", "**Exit 2**"]) {
      expect(step, `prompt handles ${code}`).toContain(code);
    }
  });

  it("fixes a streak under the protocol, else files one deduplicated issue per task", () => {
    for (const field of ["alarms", "taskId", "streak", "title", "dedupeKey"]) {
      expect(step, `prompt names ${field}`).toContain(`\`${field}`);
      expect(script, `script emits ${field}`).toContain(field);
    }
    expect(script).toContain("`eval-task-streak:${taskId}`");
    expect(step).toContain("eval-task-streak:<taskId>");
    expect(step).toContain("docs/routines/fix-protocol.md");
    expect(step).toMatch(/ONE issue per task/);
    expect(step).not.toMatch(/gh (issue|pr) (list|view)/);
  });

  it("deduplicates from the repo-scoped issue listing, never the search API", () => {
    // `search/*` answers 403 in Claude Code Remote and `--paginate` follows a
    // Link header the proxy rejects (scripts/collect-sdlc-speed.mjs).
    expect(block).not.toContain("search/issues");
    expect(block).not.toContain("--paginate");
    const issues = "gh api 'repos/mattbutlerengineering/mattbutlerengineering/issues?";
    expect(step).toContain(`${issues}state=open&labels=ci-fix&per_page=100&page=1'`);
    expect(step).toContain(
      `${issues}state=closed&labels=ci-fix&sort=updated&direction=desc&per_page=100&page=1'`
    );
    expect(step).toContain("select(.pull_request == null)");
    expect(step).toContain('contains("eval-task-streak:<taskId>")');
    expect(step).toMatch(/`page=2` and onward while a page returns 100 rows/);
    for (const label of ["`wontfix`", "`vetoed`", "`deferred`"]) {
      expect(step, `closed match labeled ${label} is not re-filed`).toContain(label);
    }
  });

  it("never reads missing or unreadable history as no streaks", () => {
    expect(step).toMatch(/\*\*Exit 2\*\* is undeterminable[^.]*, never "no streaks"/);
    expect(step).toContain("node scripts/metrics-data.mjs pull");
    expect(step).toContain("quote the JSON `reason` in step 5");
    expect(step).toMatch(/unjudged/);
  });

  it("records the outcome in the step-5 log entry", () => {
    expect(step).toMatch(/Record the exit code and every streak in step 5's log entry/);
  });
});
