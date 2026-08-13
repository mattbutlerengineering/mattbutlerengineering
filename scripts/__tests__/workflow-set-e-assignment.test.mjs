import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_DIR = resolve(ROOT, ".github/workflows");

/**
 * Find the `set -e` assignment trap in a workflow `run:` script.
 *
 * GitHub runs every `run:` block as `bash -e {0}`. A bare
 * `VAR=$(cmd)` is a simple command whose exit status is the command
 * substitution's, so a non-zero `cmd` aborts the entire step then and there.
 * Any `$?` the author reads on the following line is unreachable, and so is
 * every retry, log, or cleanup below it.
 *
 * Reading `$?` on the next line is the signal: it is the author stating in
 * code that a non-zero status is expected and handled. A bare assignment
 * with no `$?` after it is the normal fail-fast case and is left alone.
 *
 * Matched textually rather than with a YAML parser, per the precedent in
 * ci-node-matrix.test.mjs and drift-fix-workflow.test.mjs — nothing in
 * `scripts/` depends on a YAML library, and the shape being matched lives
 * inside a block scalar where a parser would hand back the same raw text.
 */
export function findSetEAssignmentTraps(source) {
  const lines = source.split("\n");
  const traps = [];

  for (let i = 0; i < lines.length - 1; i++) {
    const isCommandSubstitutionAssignment = /^\s*[A-Za-z_][A-Za-z0-9_]*=\$\(/.test(lines[i]);
    if (!isCommandSubstitutionAssignment) continue;

    // `if VAR=$(cmd); then` and `VAR=$(cmd) || fallback` are the two forms
    // that already exempt the assignment from `set -e`.
    if (/^\s*(if|while|until)\s/.test(lines[i])) continue;
    if (/\|\||&&/.test(lines[i])) continue;

    if (/\$\?/.test(lines[i + 1])) {
      traps.push({ line: i + 1, assignment: lines[i].trim(), reads: lines[i + 1].trim() });
    }
  }

  return traps;
}

describe("workflow run: blocks never read $? after a bare command-substitution assignment", () => {
  const workflows = readdirSync(WORKFLOW_DIR).filter((f) => f.endsWith(".yml"));

  it("finds workflow files to scan", () => {
    expect(workflows.length).toBeGreaterThan(0);
  });

  it.each(workflows)("%s has no unreachable $? read", (file) => {
    const traps = findSetEAssignmentTraps(readFileSync(resolve(WORKFLOW_DIR, file), "utf8"));

    // deploy-services.yml's "Trigger deployment" step carried this for the
    // life of its retry loop: `DEPLOY_OUTPUT=$(doctl apps create-deployment
    // ... )` aborted the step on attempt 1, so the 5 attempts never ran, the
    // `::warning::`/`::error::` lines never printed, and `$DEPLOY_OUTPUT` was
    // never echoed. Every failed deploy reported a bare `exit code 1` with no
    // doctl output, which is why #4040 took #4064 and #4069 to diagnose.
    // Wrap the assignment in `if`/`else` (exempt from `set -e`) instead.
    expect(traps).toEqual([]);
  });
});

describe("findSetEAssignmentTraps", () => {
  it("flags a bare assignment whose status is read on the next line", () => {
    const traps = findSetEAssignmentTraps(["OUT=$(some-cmd --wait 2>&1)", "CODE=$?"].join("\n"));
    expect(traps).toHaveLength(1);
    expect(traps[0].assignment).toBe("OUT=$(some-cmd --wait 2>&1)");
  });

  it("allows the assignment when it is the condition of an if", () => {
    const source = ["if OUT=$(some-cmd 2>&1); then", "  CODE=0", "else", "  CODE=$?", "fi"].join(
      "\n"
    );
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  it("allows the assignment when it carries its own || fallback", () => {
    const source = ["OUT=$(some-cmd 2>&1) || true", "CODE=$?"].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  it("ignores a bare assignment with no $? read after it", () => {
    const source = ["APP_ID=$(doctl apps list --no-header)", 'echo "$APP_ID"'].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });
});
