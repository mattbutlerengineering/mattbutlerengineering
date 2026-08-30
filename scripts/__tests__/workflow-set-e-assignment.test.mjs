import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW_DIR = resolve(ROOT, ".github/workflows");

/**
 * Bare bash keyword lines that close or open a block. None of these is
 * itself an executed command, so none can be the thing whose status a
 * following `$?` read is unmasking — e.g. in
 *   if OUT=$(cmd); then
 *     CODE=0
 *   else
 *     CODE=$?
 *   fi
 * the `else` line directly precedes `CODE=$?`, but the command that ran was
 * the `if`'s own condition two lines up (already exempt, see below) — `$?`
 * there is reading *that* condition's status, not masking a bare command.
 */
const STRUCTURAL_LINES = new Set(["then", "else", "fi", "done", "do", "{", "}", "esac"]);

/**
 * Find the `set -e` trap in a workflow `run:` script: a command whose
 * failure aborts the step before a `$?` read on the next line can run.
 *
 * GitHub runs every `run:` block as `bash -e {0}`. A bare command — an
 * assignment like `VAR=$(cmd)`, or a plain invocation like
 * `pnpm "$cmd" > out 2>&1` — is a simple command whose exit status is the
 * command's own, so a non-zero exit aborts the entire step then and there.
 * Any `$?` the author reads on the following line is unreachable, and so is
 * every retry, log, or cleanup below it. This is not hypothetical: it broke
 * `deploy-services.yml`'s deploy-retry loop (#4040/#4064/#4069, assignment
 * form) and `nightly-compliance.yml`'s lint/typecheck/test loop (bare
 * command form, measured against a real report artifact that silently
 * dropped the `test` line for months).
 *
 * Reading `$?` on the next line is the signal: it is the author stating in
 * code that a non-zero status is expected and handled. A bare command with
 * no `$?` after it is the normal fail-fast case and is left alone.
 *
 * Matched textually rather than with a YAML parser, per the precedent in
 * ci-node-matrix.test.mjs and drift-fix-workflow.test.mjs — nothing in
 * `scripts/` depends on a YAML library, and the shape being matched lives
 * inside a block scalar where a parser would hand back the same raw text.
 */
export function findSetEAssignmentTraps(source) {
  const lines = source.split("\n");
  const traps = [];
  let errexitDisabled = false;

  for (let i = 0; i < lines.length - 1; i++) {
    const trimmed = lines[i].trim();

    // `set +e` / `set -e` bracketing is a third, already-correct exemption:
    // while errexit is off, a non-zero exit does not abort the step, so the
    // following `$?` read is genuinely reachable. acmm-cold-start.yml and
    // docs-audit.yml both use this shape correctly.
    if (trimmed === "set +e") {
      errexitDisabled = true;
      continue;
    }
    if (trimmed === "set -e") {
      errexitDisabled = false;
      continue;
    }

    // Blank lines, comments, and bare structural keywords are never the
    // executed command a following $? read could be unmasking.
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (STRUCTURAL_LINES.has(trimmed) || /^elif\s/.test(trimmed)) continue;
    if (errexitDisabled) continue;

    // `if CMD; then` / `while CMD; do` / `until CMD; do` and `CMD || fallback`
    // / `CMD && next` are the forms that already exempt the command on this
    // line from `set -e`.
    if (/^(if|while|until)\s/.test(trimmed)) continue;
    if (/\|\||&&/.test(trimmed)) continue;

    if (/\$\?/.test(lines[i + 1])) {
      traps.push({ line: i + 1, assignment: trimmed, reads: lines[i + 1].trim() });
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

  // nightly-compliance.yml's bug: not an assignment at all, a plain command
  // with redirection (`pnpm "$cmd" > out 2>&1` / `cmd_status=$?`).
  it("flags a bare (non-assignment) command whose status is read on the next line", () => {
    const traps = findSetEAssignmentTraps(
      ['pnpm "$cmd" > "/tmp/$cmd.out" 2>&1', "cmd_status=$?"].join("\n")
    );
    expect(traps).toHaveLength(1);
    expect(traps[0].assignment).toBe('pnpm "$cmd" > "/tmp/$cmd.out" 2>&1');
  });

  it("allows a bare command when it is the condition of an if", () => {
    const source = [
      'if pnpm "$cmd" > "/tmp/$cmd.out" 2>&1; then',
      "  echo ok",
      "else",
      "  cmd_status=$?",
      "fi",
    ].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  it("allows a bare command when it carries its own || fallback", () => {
    const source = ['pnpm "$cmd" > "/tmp/$cmd.out" 2>&1 || true', "cmd_status=$?"].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  // Regression case for the false positive this widening could reintroduce:
  // deploy-services.yml's `else` / `CODE=$?` pair, where the actual command
  // ran two lines up as the `if`'s own condition. `else` (and the other bare
  // structural keywords) must never be treated as the executed command.
  it("does not flag a $? read in the else branch of an already-exempt if", () => {
    const source = [
      "if DEPLOY_OUTPUT=$(doctl apps create-deployment); then",
      "  DEPLOY_STATUS=0",
      "else",
      "  DEPLOY_STATUS=$?",
      "fi",
    ].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  it("ignores a bare command with no $? read after it", () => {
    const source = ['pnpm "$cmd" > "/tmp/$cmd.out" 2>&1', "echo done"].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  // acmm-cold-start.yml and docs-audit.yml both wrap the fragile command in
  // `set +e` / `set -e` — errexit is genuinely off there, so the $? read is
  // reachable and this is not the bug class at all.
  it("allows a bare command bracketed by set +e / set -e", () => {
    const source = ["set +e", "pnpm test", "test_status=$?", "set -e"].join("\n");
    expect(findSetEAssignmentTraps(source)).toEqual([]);
  });

  it("still flags the same command once set -e re-enables errexit before it", () => {
    const source = ["set +e", "echo warmup", "set -e", "pnpm test", "test_status=$?"].join("\n");
    const traps = findSetEAssignmentTraps(source);
    expect(traps).toHaveLength(1);
    expect(traps[0].assignment).toBe("pnpm test");
  });
});
