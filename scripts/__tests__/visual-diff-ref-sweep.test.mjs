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

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { formatSweepSummary, resolveDryRun, sweepExitCode } from "../visual-diff-refs.mjs";

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

// ---------------------------------------------------------------------------
// The verdict is rendered from OUTCOMES, and a failed deletion reds the job.
//
// Same defect class as the epoch bug this branch already fixed: the sweep used
// to render `formatSweepSummary(plan)` — the PLAN — before and independently of
// the delete loop, and `deleteRef`'s `{outcome:'failed'}` reached stdout only,
// never GITHUB_STEP_SUMMARY and never the exit code. Measured against the real
// main() with DRY_RUN=false and an unwritable remote: every delete came back
// `remote rejected`, the process exited 0, the summary claimed success, and the
// refs were still there.
// ---------------------------------------------------------------------------

const PLAN = {
  toDelete: [
    { name: "visual-diffs/pr-9/run-1-attempt-1", reason: "closed-pr" },
    { name: "visual-diffs/pr-9/run-2-attempt-1", reason: "closed-pr" },
  ],
  retained: [{ name: "visual-diffs/pr-8/run-7-attempt-1", reason: "newest-on-open-pr" }],
};

describe("formatSweepSummary", () => {
  it("reports a DRY RUN from the plan — nothing was attempted, so there is no outcome", () => {
    const text = formatSweepSummary(PLAN, true, []);
    expect(text).toContain("DRY RUN");
    expect(text).toContain("Would delete: visual-diffs/pr-9/run-1-attempt-1 (closed-pr)");
    expect(text).not.toMatch(/Deleted:/);
  });

  it("reports a LIVE run from the outcomes, naming each failure as a failure", () => {
    const outcomes = [
      { name: "visual-diffs/pr-9/run-1-attempt-1", outcome: "deleted" },
      {
        name: "visual-diffs/pr-9/run-2-attempt-1",
        outcome: "failed",
        error: "remote rejected (permission denied)",
      },
    ];
    const text = formatSweepSummary(PLAN, false, outcomes);
    expect(text).toContain("Deleted: visual-diffs/pr-9/run-1-attempt-1");
    expect(text).toMatch(/FAILED[^\n]*visual-diffs\/pr-9\/run-2-attempt-1/);
    expect(text).toContain("remote rejected (permission denied)");
  });

  it("NEVER claims a deletion that failed", () => {
    const outcomes = PLAN.toDelete.map((ref) => ({
      name: ref.name,
      outcome: "failed",
      error: "remote rejected",
    }));
    const text = formatSweepSummary(PLAN, false, outcomes);
    for (const ref of PLAN.toDelete) {
      expect(text).not.toContain(`Deleted: ${ref.name}`);
    }
  });

  it("counts an already-absent ref as done — the sweep is idempotent", () => {
    const outcomes = [
      { name: "visual-diffs/pr-9/run-1-attempt-1", outcome: "already-absent" },
      { name: "visual-diffs/pr-9/run-2-attempt-1", outcome: "deleted" },
    ];
    expect(formatSweepSummary(PLAN, false, outcomes)).not.toMatch(/FAILED/);
  });

  it("says so when a planned deletion produced no outcome at all", () => {
    expect(formatSweepSummary(PLAN, false, [])).toMatch(/not attempted/i);
  });

  it("still lists what it kept, so a live run stays as readable as a dry one", () => {
    expect(formatSweepSummary(PLAN, false, [])).toContain(
      "Keeping: visual-diffs/pr-8/run-7-attempt-1 (newest-on-open-pr)"
    );
  });
});

describe("sweepExitCode", () => {
  it("is 0 when every deletion landed or was already gone", () => {
    expect(
      sweepExitCode([
        { name: "a", outcome: "deleted" },
        { name: "b", outcome: "already-absent" },
      ])
    ).toBe(0);
  });

  it("is 0 for a dry run, which attempts nothing", () => {
    expect(sweepExitCode([])).toBe(0);
  });

  it("is NON-ZERO when any deletion failed", () => {
    expect(
      sweepExitCode([
        { name: "a", outcome: "deleted" },
        { name: "b", outcome: "failed", error: "remote rejected" },
      ])
    ).not.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// The same claim, against the REAL main() — the seam the unit tests above
// cannot reach, and the one the review actually measured.
// ---------------------------------------------------------------------------

const SCRIPT_PATH = resolve(REPO_ROOT, "scripts/visual-diff-refs.mjs");
const OLD_COMMIT_DATE = "2020-01-01T00:00:00Z";
const DOOMED_REF = "visual-diffs/pr-9/run-1-attempt-1";

let sandbox;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), "visual-diff-sweep-"));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

/**
 * A PATH holding fake `git` and `gh` binaries. The sweep shells out through
 * `execFileSync("git"|"gh", …)`, so shims are the whole harness — no network,
 * no repository, and no way for the real ones to be reached.
 *
 * `pushExit` is what `git push origin --delete` returns. The rejection text
 * deliberately avoids "remote ref does not exist" / "unable to delete", which
 * `deleteRef` classifies as already-absent success.
 */
function shimPath({ pushExit }) {
  const bin = join(sandbox, "bin");
  mkdirSync(bin, { recursive: true });

  writeFileSync(
    join(bin, "git"),
    `#!/bin/sh
case "$1 $2" in
  "ls-remote --heads")
    echo "1111111111111111111111111111111111111111\trefs/heads/${DOOMED_REF}"
    exit 0 ;;
  "push origin")
    if [ "${pushExit}" -ne 0 ]; then
      echo "remote: Permission to o/r.git denied." >&2
      echo "! [remote rejected] ${DOOMED_REF} (pre-receive hook declined)" >&2
    fi
    exit ${pushExit} ;;
esac
exit 0
`
  );

  writeFileSync(
    join(bin, "gh"),
    `#!/bin/sh
case "$2" in
  list) exit 0 ;;                 # gh pr list — no open pull requests
  *) echo "${OLD_COMMIT_DATE}" ;; # gh api …/git/commits/<sha>
esac
exit 0
`
  );

  chmodSync(join(bin, "git"), 0o755);
  chmodSync(join(bin, "gh"), 0o755);
  return `${bin}:${process.env.PATH}`;
}

function runSweep({ pushExit }) {
  const summaryFile = join(sandbox, "step-summary.md");
  writeFileSync(summaryFile, "");
  const run = spawnSync(process.execPath, [SCRIPT_PATH], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: shimPath({ pushExit }),
      DRY_RUN: "false",
      GITHUB_REPOSITORY: "o/r",
      GITHUB_STEP_SUMMARY: summaryFile,
    },
  });
  return { ...run, summary: readFileSync(summaryFile, "utf8") };
}

describe("the sweep's real main(), against a remote that rejects every delete", () => {
  it("exits NON-ZERO instead of reporting a clean sweep", () => {
    expect(runSweep({ pushExit: 1 }).status).not.toBe(0);
  });

  it("writes the failure into GITHUB_STEP_SUMMARY, not only to stdout", () => {
    const { summary } = runSweep({ pushExit: 1 });
    expect(summary).toMatch(/FAILED/);
    expect(summary).toContain(DOOMED_REF);
  });

  it("does not claim in the summary that it deleted the ref it did not delete", () => {
    expect(runSweep({ pushExit: 1 }).summary).not.toContain(`Deleted: ${DOOMED_REF}`);
  });

  it("still exits 0 and reports the deletion when the remote accepts it", () => {
    // The positive control: without it, an exit code that is non-zero for an
    // unrelated reason would satisfy every assertion above.
    const { status, summary } = runSweep({ pushExit: 0 });
    expect(status).toBe(0);
    expect(summary).toContain(`Deleted: ${DOOMED_REF}`);
    expect(summary).not.toMatch(/FAILED/);
  });
});
