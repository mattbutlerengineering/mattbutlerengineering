import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/auto-label.yml"), "utf8");

/**
 * `auto-label.yml` ran 200+ times, always green, and never applied a single
 * label — measured 2026-09-21.
 *
 * The job has no `actions/checkout`, so there is no `.git` in the runner's
 * working directory. `gh issue edit` resolves its target repository from the
 * git remote, so every call died with:
 *
 *   failed to run git: fatal: not a git repository (or any of the parent
 *   directories): .git
 *
 * Both calls were suffixed `|| true`, so the step exited 0 and the run showed
 * success with "Computed labels: docs" right above the silent failure. Across
 * five sampled runs the error appears in every one that had labels to apply;
 * the only clean run computed `(none)` and skipped the step. Confirmed against
 * data: the rule computes `docs` for 27 of the last 80 issues and **zero**
 * issues carry it. `git log -S"GH_REPO"` on this file returns nothing, so it
 * has been broken since it was introduced on 2026-04-25 (#628).
 *
 * Textual parsing, matching the precedent in ci-node-matrix.test.mjs and
 * drift-fix-workflow.test.mjs — nothing in `scripts/` depends on a YAML parser.
 */
describe("auto-label.yml", () => {
  it("can resolve the repository for `gh` without a checkout", () => {
    // Either give the job a git context, or tell `gh` the repo explicitly.
    // GH_REPO is the cheaper of the two and is what this workflow uses.
    const hasRepoContext =
      /GH_REPO:\s*\$\{\{\s*github\.repository\s*\}\}/.test(WORKFLOW) ||
      /actions\/checkout/.test(WORKFLOW);
    expect(hasRepoContext).toBe(true);
  });

  it("does not swallow a failed label application", () => {
    // `gh label create ... || true` is fine — the label usually already exists.
    // `gh issue edit --add-label ... || true` is what hid this bug for five
    // months: it is the call that does the actual work, and its failure was
    // indistinguishable from success.
    // Skip comment lines: the step's own comment mentions `gh issue edit`, and
    // matching it instead of the command made this assertion pass vacuously.
    const editLine = WORKFLOW.split("\n").find(
      (l) => l.includes("gh issue edit") && !l.trim().startsWith("#")
    );
    expect(editLine, "auto-label.yml no longer calls `gh issue edit`").toBeDefined();
    expect(editLine).not.toMatch(/\|\|\s*true/);
  });

  it("routes the `docs` label on a title prefix, not a body keyword", () => {
    // The body-keyword form `/\b(documentation|README|docs?)\b/i` matched 27 of
    // the last 80 issues, because `docs/...` path citations are routine in this
    // repo's issue bodies. Repairing the workflow without narrowing this would
    // have turned a dead rule straight into a noisy one. The clean case is
    // already covered without the workflow: .github/ISSUE_TEMPLATE/documentation.yml
    // declares `labels: ["documentation"]`, which GitHub applies on its own.
    expect(WORKFLOW).not.toMatch(/\\b\(documentation\|README\|docs\?\)\\b/);
    expect(WORKFLOW).toMatch(/\^docs\[\(:\]/);
  });

  it("routes the `feature` label on a title prefix, not a body keyword", () => {
    // The `\bfeature\b` body keyword was applied to 12 issues between
    // 2026-10-13 and 2026-10-16 and all 12 were wrong (/ideate proposals,
    // ideation batches, a docs meta-improvement, a ci-fix citing "the original
    // feature"). /decompose already labels genuine features at creation, so the
    // body rule could only add false positives, and a second type label makes
    // the conductor refuse to plan the issue.
    const featureLine = WORKFLOW.split("\n").find(
      (l) => l.includes("labels.add('feature')") && !l.trim().startsWith("//")
    );
    expect(featureLine, "auto-label.yml no longer adds `feature`").toBeDefined();
    expect(featureLine).toContain("^feat\\(");
    expect(featureLine).not.toContain("\\bfeature\\b");
  });
});

describe("auto-label.yml negated-closing-refs job (#9773)", () => {
  it("runs on pull_request_target opened/edited and stays advisory", () => {
    expect(WORKFLOW).toMatch(/pull_request_target:\s*\n\s*types: \[opened, edited\]/);
    expect(WORKFLOW).toContain("negated-closing-refs.mjs");
    expect(WORKFLOW).toMatch(/continue-on-error: true/);
    expect(WORKFLOW).not.toMatch(/ref:\s*\$\{\{\s*github\.event\.pull_request\.head/);
  });
});

/**
 * #9895: the audit rule added `ready` on every `edited` event, so an `[Audit]`
 * issue a session had claimed `in-progress` went back into the drain's queue a
 * minute later (#9888, #9890, #9891 on 2026-11-27). Runs the workflow's own
 * label script, not a copy of it.
 */
describe("auto-label.yml audit rule respects claimed issues (#9895)", () => {
  const script = /node - <<'NODE'\n([\s\S]*?)\n\s*NODE\n/.exec(WORKFLOW)?.[1] ?? "";

  function computeLabels(title, existing) {
    const dir = mkdtempSync(join(tmpdir(), "auto-label-"));
    const out = join(dir, "out");
    writeFileSync(out, "");
    execFileSync(process.execPath, ["-"], {
      input: script,
      env: {
        ...process.env,
        ISSUE_TITLE: title,
        ISSUE_BODY: "",
        ISSUE_LABELS: JSON.stringify(existing),
        GITHUB_OUTPUT: out,
      },
      stdio: ["pipe", "ignore", "inherit"],
    });
    const line = readFileSync(out, "utf8").trim();
    return line
      .replace(/^labels=/, "")
      .split(",")
      .filter(Boolean);
  }

  it("extracts the label script from the workflow", () => {
    expect(script).toContain("labels.add('ready')");
  });

  it("still marks an unclaimed audit issue ready", () => {
    expect(computeLabels("[Audit] UX: slow page", [])).toContain("ready");
  });

  it.each(["in-progress", "has-pr", "blocked", "tracking", "ready-for-human", "needs-human"])(
    "does not mark an audit issue ready when it already carries %s",
    (label) => {
      expect(computeLabels("[Audit] UX: slow page", [label])).not.toContain("ready");
    }
  );

  it("passes the issue's current labels to the script from the event payload", () => {
    expect(WORKFLOW).toMatch(
      /ISSUE_LABELS:\s*\$\{\{\s*toJSON\(github\.event\.issue\.labels\.\*\.name\)\s*\}\}/
    );
  });
});
