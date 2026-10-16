import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getJob, getStep, loadWorkflow } from "../lib/workflow.mjs";

/**
 * #6849: auto-review.yml Checks 2 (console.log) and 3 (TODO/FIXME) grepped the
 * whole PR diff with no per-file filter, so a docs/data-only PR that merely
 * quoted `console.log` got a false "Debug Statements" finding. They must only
 * look at code files, like Check 7's extension `case`.
 *
 * Executes the real `Run review checks` run block under bash with a stub `gh`
 * returning a synthetic diff, so both directions are proven.
 */
const STEP = getStep(getJob(loadWorkflow("auto-review.yml"), "review"), "Run review checks");

function diffFor(file, addedLine) {
  return [
    `diff --git a/${file} b/${file}`,
    "index 1111111..2222222 100644",
    `--- a/${file}`,
    `+++ b/${file}`,
    "@@ -1,1 +1,2 @@",
    " context",
    `+${addedLine}`,
    "",
  ].join("\n");
}

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "auto-review-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function runReview(diff, changedFiles) {
  writeFileSync(join(dir, "diff.txt"), diff);
  writeFileSync(join(dir, "gh"), `#!/bin/bash\ncat "${join(dir, "diff.txt")}"\n`);
  writeFileSync(join(dir, "node"), "#!/bin/bash\nexit 0\n");
  chmodSync(join(dir, "gh"), 0o755);
  chmodSync(join(dir, "node"), 0o755);
  // The run block reads /tmp/changed-files.txt (written by the previous step).
  // Rewrite that path into the sandbox so tests never touch the real /tmp file.
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

describe("auto-review.yml code-file filter (#6849)", () => {
  it.each(["docs/notes.md", "metrics/data.jsonl", ".github/workflows/x.yml", "pnpm-lock.yaml"])(
    "ignores console.log and TODO text added in %s",
    (file) => {
      const out = runReview(diffFor(file, "console.log('x') TODO: write more"), `${file}\n`);
      expect(out).not.toContain("Debug Statements");
      expect(out).not.toContain("TODO/FIXME");
    }
  );

  it.each(["src/a.ts", "src/a.tsx", "src/a.js", "src/a.jsx", "scripts/a.mjs", "scripts/a.cjs"])(
    "still flags console.log and TODO added in %s",
    (file) => {
      const out = runReview(diffFor(file, "console.log('x'); // TODO: remove"), `${file}\n`);
      expect(out).toContain("Debug Statements");
      expect(out).toContain("TODO/FIXME");
    }
  );

  it("only counts code files in a mixed diff", () => {
    const diff = diffFor("docs/a.md", "console.log(1)") + diffFor("src/a.ts", "console.log(2)");
    const out = runReview(diff, "docs/a.md\nsrc/a.ts\n");
    expect(out).toContain("Found **1** added");
  });
});
