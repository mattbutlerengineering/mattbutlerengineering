/**
 * The sweep's wiring, asserted at the two seams a unit test can reach: the
 * dry-run default in the script, and the workflow file that supplies it.
 *
 * The workflow half exists for one measured reason. `branch-cleanup.yml`
 * hard-wires `DRY_RUN` to `'true'` for every event that is not
 * `workflow_dispatch`, so its *scheduled* runs — the only ones that happen
 * unattended — can never delete anything. That workflow has been shipped and
 * scheduled for months in that state. The sweep is a separate workflow
 * specifically so it does not inherit that, and this file is what stops the
 * pattern being copied back in by someone reading the neighbouring file for
 * precedent.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDryRun } from "../visual-diff-refs.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const SWEEP_PATH = resolve(REPO_ROOT, ".github/workflows/visual-diff-ref-sweep.yml");
const BRANCH_CLEANUP_PATH = resolve(REPO_ROOT, ".github/workflows/branch-cleanup.yml");

const SWEEP = readFileSync(SWEEP_PATH, "utf8");
const SCRIPT = readFileSync(resolve(REPO_ROOT, "scripts/visual-diff-refs.mjs"), "utf8");

/**
 * Pure: does this workflow source force `DRY_RUN` on for every event other
 * than `workflow_dispatch`? That is the shape that makes a scheduled sweep
 * decorative.
 */
function scheduledRunIsAlwaysDryRun(source) {
  return /DRY_RUN:\s*\$\{\{[^}]*event_name\s*!=\s*'workflow_dispatch'\s*&&\s*'true'/.test(source);
}

describe("resolveDryRun", () => {
  it("defaults to a dry run when DRY_RUN is unset", () => {
    expect(resolveDryRun({})).toBe(true);
  });

  it("only goes live on the exact string 'false'", () => {
    expect(resolveDryRun({ DRY_RUN: "false" })).toBe(false);
  });

  it("stays dry on 'true'", () => {
    expect(resolveDryRun({ DRY_RUN: "true" })).toBe(true);
  });

  it.each(["", "0", "no", "FALSE", "False", " false", "false "])(
    "stays dry on the near-miss %o rather than guessing the operator meant live",
    (value) => {
      expect(resolveDryRun({ DRY_RUN: value })).toBe(true);
    }
  );
});

describe("the scheduled-always-dry-run trap", () => {
  it("is present in branch-cleanup.yml — the predicate is not vacuous", () => {
    expect(scheduledRunIsAlwaysDryRun(readFileSync(BRANCH_CLEANUP_PATH, "utf8"))).toBe(true);
  });

  it("is NOT reproduced by the sweep workflow", () => {
    expect(scheduledRunIsAlwaysDryRun(SWEEP)).toBe(false);
  });

  it("leaves the scheduled sweep able to actually delete", () => {
    // The env expression must resolve to the live value on a schedule, which
    // means 'false' has to be its fallback rather than 'true'.
    const dryRunLine = SWEEP.split("\n").find((line) => line.includes("DRY_RUN:"));
    expect(dryRunLine).toBeDefined();
    expect(dryRunLine).toContain("'false'");
    expect(dryRunLine).toContain("workflow_dispatch");
  });
});

describe("visual-diff-ref-sweep.yml", () => {
  it("runs daily on a schedule", () => {
    const cron = /- cron: "([^"]+)"/.exec(SWEEP);
    expect(cron, "no cron entry").not.toBeNull();
    const fields = cron[1].trim().split(/\s+/);
    expect(fields).toHaveLength(5);
    // day-of-month and day-of-week both unrestricted => every day.
    expect(fields[2]).toBe("*");
    expect(fields[4]).toBe("*");
  });

  it("is dispatchable by hand, with the dry run as the default", () => {
    expect(SWEEP).toContain("workflow_dispatch:");
    expect(SWEEP).toMatch(/dry_run:[\s\S]*default: true/);
  });

  it("grants exactly the two scopes the sweep uses", () => {
    expect(SWEEP).toMatch(/permissions:\s*\n\s*contents: write/);
    expect(SWEEP).toMatch(/pull-requests: read/);
  });

  it("pins every action by full commit SHA", () => {
    const uses = [...SWEEP.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) {
      expect(ref, `${ref} is not pinned to a 40-character commit SHA`).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("installs nothing — the script imports only node builtins", () => {
    // Comments are allowed to mention pnpm — this file's whole point is
    // explaining why it does not need it. Only executable lines are scanned.
    const executable = SWEEP.split("\n").filter((line) => !line.trim().startsWith("#"));
    expect(executable.join("\n")).not.toContain("pnpm");
    expect(executable.join("\n")).not.toContain("setup-workspace");
    expect(SWEEP).toContain("node scripts/visual-diff-refs.mjs");

    const imports = [...SCRIPT.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec, `${spec} is not a node builtin`).toMatch(/^node:/);
    }
  });
});

describe("the sweep's shell-outs", () => {
  it("uses execFileSync with argv arrays, never a shell string", () => {
    expect(SCRIPT).toContain("execFileSync");
    expect(SCRIPT).not.toContain("execSync(");
  });

  it("never force-pushes", () => {
    // The argv literal, not the word — the module docstring says out loud that
    // --force must never be introduced, and that sentence is not a violation.
    expect(SCRIPT).not.toContain('"--force"');
  });

  it("deletes through git push --delete", () => {
    expect(SCRIPT).toContain('"--delete"');
  });
});
