import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

/**
 * #8521: auto-review.yml's old Check 4 ("Potential Hardcoded Secrets") regex-
 * matched the whole diff — context lines, test fixtures, variable references
 * — and set severity `critical`. 9 of 9 sampled hits were false positives,
 * and real secret scanning already runs in secret-scan.yml, GitHub push
 * protection and the secret-scan.mjs edit hook. The check was removed; these
 * cases pin that the three false-positive shapes no longer escalate a PR.
 *
 * Executes the real `Run review checks` run block under bash with a stub `gh`
 * returning a synthetic diff (same harness as auto-review-file-filter).
 */
const STEP = getStep(getJob(loadWorkflow("auto-review.yml"), "review"), "Run review checks");

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auto-review-secret-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function diffFor(file, lines) {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,1 +1,2 @@",
    ...lines,
    "",
  ].join("\n");
}

function runReview(diff, changedFiles) {
  writeFileSync(join(dir, "diff.txt"), diff);
  writeFileSync(join(dir, "gh"), `#!/bin/bash\ncat "${join(dir, "diff.txt")}"\n`);
  writeFileSync(join(dir, "node"), "#!/bin/bash\nexit 0\n");
  chmodSync(join(dir, "gh"), 0o755);
  chmodSync(join(dir, "node"), 0o755);
  const script = STEP.run.replaceAll("/tmp/changed-files.txt", join(dir, "changed.txt"));
  writeFileSync(join(dir, "changed.txt"), changedFiles);
  const out = join(dir, "out.txt");
  writeFileSync(out, "");
  execFileSync("bash", ["-c", script], {
    cwd: dir,
    env: { PATH: `${dir}:${process.env.PATH}`, PR_NUMBER: "1", GITHUB_OUTPUT: out },
  });
  return readFileSync(out, "utf8");
}

describe("auto-review.yml has no regex secret check (#8521)", () => {
  it.each([
    ["a test fixture", "src/a.test.ts", ['+  password: "test-password",']],
    [
      "an unchanged context line",
      "src/b.ts",
      [' const MANAGE_TOKEN = "locale-sweep-token";', "+export {};"],
    ],
    [
      "a variable reference",
      ".github/workflows/x.yml",
      ['+  GH_TOKEN="$MERGE_TOKEN" gh api repos/x'],
    ],
  ])("does not flag %s as critical", (_label, file, lines) => {
    const out = runReview(diffFor(file, lines), `${file}\n`);
    expect(out).not.toContain("Potential Hardcoded Secrets");
    expect(out).not.toContain("severity=critical");
  });
});
