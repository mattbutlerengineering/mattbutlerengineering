import { describe, it, expect, afterEach } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = fs.readFileSync(resolve(ROOT, ".github/workflows/changelog.yml"), "utf8");

/**
 * Pull a step's `run:` body out of the workflow by name -- either a
 * block-scalar (`run: |`) or a single-line command.
 *
 * Parsed textually rather than with a YAML library, matching the precedent
 * in pulumi-cli-pin.test.mjs and drift-fix-workflow.test.mjs: these are
 * plain indented literals with no anchors or flow syntax to get wrong. The
 * search for `run:` is bounded to this step's own line range -- a step with
 * a single-line `run:` (no trailing `|`) has no block to find, and without
 * that bound the naive "next `run: |` anywhere in the file" search silently
 * matches a *different* step's block instead of failing.
 */
function extractStepRunBody(workflow, stepName) {
  const lines = workflow.split("\n");
  const stepStart = lines.findIndex((l) => l.trim() === `- name: ${stepName}`);
  if (stepStart === -1) throw new Error(`changelog.yml has no step named "${stepName}"`);
  const stepIndent = lines[stepStart].match(/^(\s*)/)[1].length;

  let stepEnd = lines.length;
  for (let i = stepStart + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    // The next line at or above this step's own indent starts a new step.
    if (lines[i].match(/^(\s*)/)[1].length <= stepIndent) {
      stepEnd = i;
      break;
    }
  }
  const stepLines = lines.slice(stepStart, stepEnd);

  const runIdx = stepLines.findIndex((l) => /^\s*run:/.test(l));
  if (runIdx === -1) throw new Error(`"${stepName}" step has no \`run:\` key`);

  if (!/^\s*run:\s*\|\s*$/.test(stepLines[runIdx])) {
    // Single-line `run: <command>`.
    return stepLines[runIdx].replace(/^\s*run:\s*/, "");
  }

  const indent = stepLines[runIdx].match(/^(\s*)/)[1].length;
  const body = [];
  for (const line of stepLines.slice(runIdx + 1)) {
    if (line.trim() === "") {
      body.push("");
      continue;
    }
    // The block ends at the first non-blank line indented no further than `run:`.
    if (line.match(/^(\s*)/)[1].length <= indent) break;
    body.push(line);
  }
  return body.join("\n");
}

/**
 * Extract the emptiness-check `if ... fi` construct from the "Create PR
 * with changelog" step body -- the exact snippet that decides whether the
 * job creates a PR or exits as a no-op.
 */
function extractEmptinessCheck(stepBody) {
  const lines = stepBody.split("\n");
  const ifStart = lines.findIndex((l) => /^\s*if\b/.test(l));
  if (ifStart === -1) throw new Error('"Create PR with changelog" step has no `if` check');
  const fiIndex = lines.findIndex((l, i) => i > ifStart && /^\s*fi\s*$/.test(l));
  if (fiIndex === -1) throw new Error("emptiness check `if` block has no matching `fi`");
  return lines.slice(ifStart, fiIndex + 1).join("\n");
}

/** Set up a throwaway git repo with one commit, for the emptiness-check tests. */
function initScratchRepo() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-emptiness-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  fs.writeFileSync(path.join(repoDir, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: repoDir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });
  return repoDir;
}

/** Run the extracted emptiness check for real, in `cwd`, with a trailing marker to detect early exit. */
function runEmptinessCheck(check, cwd) {
  const script = `${check}\necho REACHED_AFTER`;
  return spawnSync("bash", ["-c", script], { cwd, encoding: "utf8" });
}

describe("changelog.yml emptiness check (Defect 1)", () => {
  let repoDir;

  afterEach(() => {
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
    repoDir = undefined;
  });

  it("reports a new, untracked CHANGELOG.md as changed -- not as a no-op", () => {
    // MEASURED bug: `git diff --quiet CHANGELOG.md` ignores untracked files.
    // There is no root CHANGELOG.md in this repo, so changelogen always
    // creates a brand-new, untracked one -- and this check took the "no
    // changes" branch on every single run since the workflow was added.
    repoDir = initScratchRepo();
    fs.writeFileSync(path.join(repoDir, "CHANGELOG.md"), "# Changelog\n\n## v1.0.0\n");

    const stepBody = extractStepRunBody(WORKFLOW, "Create PR with changelog");
    const check = extractEmptinessCheck(stepBody);
    const result = runEmptinessCheck(check, repoDir);

    expect(result.stdout).not.toContain("No changelog changes detected");
    expect(result.stdout).toContain("REACHED_AFTER");
  });

  it("still treats a genuinely unchanged, already-committed CHANGELOG.md as a no-op", () => {
    // The fix must not regress into an unconditional PR: a CHANGELOG.md that
    // is already committed and untouched must still take the early-exit path.
    repoDir = initScratchRepo();
    fs.writeFileSync(path.join(repoDir, "CHANGELOG.md"), "# Changelog\n\n## v1.0.0\n");
    execFileSync("git", ["add", "CHANGELOG.md"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "add changelog"], { cwd: repoDir });

    const stepBody = extractStepRunBody(WORKFLOW, "Create PR with changelog");
    const check = extractEmptinessCheck(stepBody);
    const result = runEmptinessCheck(check, repoDir);

    expect(result.stdout).toContain("No changelog changes detected");
    expect(result.stdout).not.toContain("REACHED_AFTER");
  });

  it("still reports a modification to an already-tracked CHANGELOG.md as changed", () => {
    repoDir = initScratchRepo();
    fs.writeFileSync(path.join(repoDir, "CHANGELOG.md"), "# Changelog\n\n## v1.0.0\n");
    execFileSync("git", ["add", "CHANGELOG.md"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "add changelog"], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "CHANGELOG.md"), "# Changelog\n\n## v1.1.0\n## v1.0.0\n");

    const stepBody = extractStepRunBody(WORKFLOW, "Create PR with changelog");
    const check = extractEmptinessCheck(stepBody);
    const result = runEmptinessCheck(check, repoDir);

    expect(result.stdout).not.toContain("No changelog changes detected");
    expect(result.stdout).toContain("REACHED_AFTER");
  });
});

describe("changelog.yml changelogen invocation (Defect 2)", () => {
  it("passes an explicit bounded --from instead of defaulting to the last tag", () => {
    // MEASURED bug: with no --from, changelogen walks back to the nearest
    // reachable tag (packages/rialto@0.2.0, 2200+ commits back), producing a
    // 2.1 MB `git log` that blows Node's 1 MB default child_process
    // maxBuffer and throws a bare ENOBUFS. This is a monthly job -- the
    // range must be bounded to roughly a month, not left to default.
    const stepBody = extractStepRunBody(WORKFLOW, "Generate changelog");

    expect(stepBody).toMatch(
      /changelogen\s+--output\s+CHANGELOG\.md\s+--from\s+"?\$\{?FROM_REF\}?"?/
    );
    // The bound must be computed, not hardcoded to a specific tag/sha --
    // a hardcoded ref would stop advancing and silently under-report every
    // month after the one it was written for.
    expect(stepBody).toMatch(/FROM_REF=\$\(/);
  });

  it("fails loudly with a diagnosable message if the bounded range still risks ENOBUFS", () => {
    // A single month is not a permanent fix: one month's log is already
    // 758,785 bytes across 701 commits (2026-08), and this repo's commit
    // volume will cross the 1 MB maxBuffer again within a few months. The
    // step must fail with an actionable message instead of reproducing a
    // bare, undiagnosable ENOBUFS when that happens.
    const stepBody = extractStepRunBody(WORKFLOW, "Generate changelog");

    expect(stepBody).toMatch(/MAX_SAFE_BYTES/);
    expect(stepBody).toMatch(/::error::/);
  });

  it("sets pipefail, since the step's exit code is the point and it pipes a command", () => {
    const stepBody = extractStepRunBody(WORKFLOW, "Generate changelog");
    expect(stepBody).toMatch(/^\s*set -o pipefail\s*$/m);
  });
});
