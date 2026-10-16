import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/claude-md-sync.yml"), "utf8");

/**
 * The `Create sync issue` step files an issue, which died with
 * `Resource not accessible by integration (createIssue)` on every run that had
 * something to report (2026-09-21, 09-28, 10-12): the workflow-level
 * `permissions:` block never granted `issues: write`. Green runs were only the
 * weeks with nothing to say.
 *
 * Textual parsing, matching ci-docs-format-gate.test.mjs and pulumi-cli-pin.test.mjs.
 */
describe("claude-md-sync.yml", () => {
  it("grants issues: write to the job that files the sync issue", () => {
    expect(WORKFLOW).toMatch(/name: Create sync issue/);
    const block = WORKFLOW.match(/^permissions:\n((?: {2}\S.*\n)+)/m);
    expect(block, "no top-level permissions block").not.toBeNull();
    expect(block[1]).toMatch(/^ {2}issues:\s*write\s*$/m);
    expect(block[1]).toMatch(/^ {2}contents:\s*write\s*$/m);
    expect(block[1]).toMatch(/^ {2}pull-requests:\s*write\s*$/m);
  });
});
