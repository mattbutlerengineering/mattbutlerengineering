import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/auto-review.yml"), "utf8");

/**
 * #5957: Check 7 reported "Missing Test Files" for every DELETED source file.
 * `gh pr diff --name-only` lists deleted paths and has no --diff-filter flag,
 * and the test probe is `[ -f ]` against the checked-out tree, where a deleted
 * source's test is gone too. The fix skips paths absent from the checkout.
 *
 * This runs the real Check 7 shell block extracted from the workflow, so the
 * guard cannot be silently dropped.
 */
function extractCheck7() {
  const start = WORKFLOW.indexOf("# Check 7:");
  const end = WORKFLOW.indexOf('if [ -n "$MISSING_TESTS" ]', start);
  if (start === -1 || end === -1) throw new Error("Check 7 block not found");
  return WORKFLOW.slice(start, end)
    .split("\n")
    .map((l) => l.replace(/^ {10}/, ""))
    .join("\n");
}

function write(dir, rel, body = "") {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
}

describe("auto-review Check 7 (missing test files)", () => {
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "auto-review-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(changed) {
    writeFileSync(join(dir, "changed.txt"), changed.join("\n") + "\n");
    const script = extractCheck7().replace(/\/tmp\/changed-files\.txt/g, "changed.txt");
    return execFileSync("bash", ["-c", `${script}\nprintf '%b' "$MISSING_TESTS"`], {
      cwd: dir,
      encoding: "utf8",
    });
  }

  it("does not flag a deleted source file (absent from the checkout)", () => {
    expect(run(["src/gone.ts"])).toBe("");
  });

  it("still flags an added/modified source file with no test", () => {
    write(dir, "src/untested.ts", "export {};");
    expect(run(["src/untested.ts", "src/gone.ts"])).toBe("- `src/untested.ts`\n");
  });

  it("does not flag a source file that has a test", () => {
    write(dir, "src/ok.ts", "export {};");
    write(dir, "src/__tests__/ok.test.ts", "");
    expect(run(["src/ok.ts"])).toBe("");
  });
});
