import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Guards the docs-only formatting hole measured on 2026-08-31.
 *
 * `detect-changes` sets `has_code=false` for a PR touching only `docs/**` /
 * `**.md`, and the whole Build chain — which is where `pnpm repo-audit` runs
 * `prettier --check .` — is gated on `has_code == 'true'`. So a docs-only PR
 * merged with `CI Gate` green having never had its markdown formatted, and the
 * dirty files then failed "Run Full Repository Audit" on the NEXT code PR's
 * merge ref and on every main push: #4787 landed six unformatted run docs and
 * simultaneously reddened #4790/#4792/#4797 and main (`a4473b0f9`).
 *
 * The push trigger used to have the same hole from the other side: its
 * `paths-ignore` listed `docs/**` and `**.md`, so a docs-only commit reaching
 * main ran no push CI at all — which is why the direct push in #4664
 * (`7d259272a`, one line in docs/backlog.md) was never format-checked, and why
 * a docs-only fix commit could not retro-green a red main. Those two entries
 * are now gone from `paths-ignore`; the `prepare` gate, not the trigger, is
 * what keeps a docs push cheap.
 *
 * Parsed textually rather than with a YAML library, matching the precedent in
 * ci-node-matrix.test.mjs / drift-fix-workflow.test.mjs: nothing in `scripts/`
 * depends on a YAML parser.
 */
function jobBlock(source, jobName) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const JOB = "docs-format";

describe("ci.yml docs-only formatting gate", () => {
  it("defines the job", () => {
    expect(() => jobBlock(WORKFLOW, JOB)).not.toThrow();
  });

  it("runs the same prettier check the Build chain runs, not a hand-rolled subset", () => {
    // `pnpm check:prettier` is `prettier --check .` and is what repo-audit
    // calls. Re-implementing the glob here would let the two drift, which is
    // the class of bug this whole file exists for.
    expect(jobBlock(WORKFLOW, JOB)).toMatch(/run:\s*pnpm check:prettier/);
  });

  it("runs exactly when the Build chain does NOT, so it is not redundant work", () => {
    const block = jobBlock(WORKFLOW, JOB);
    expect(block).toMatch(/needs:\s*\[detect-changes\]/);
    expect(block).toMatch(/if:\s*needs\.detect-changes\.outputs\.has_code != 'true'/);
  });

  it("also runs on a docs-only push to main, not just on PRs", () => {
    // Removing these two entries is the whole fix for #4664's actionable half.
    // If either comes back, a docs-only commit on main goes unchecked again
    // and reddens the next code PR's merge ref instead of its own run.
    const pushTrigger = WORKFLOW.slice(
      WORKFLOW.indexOf("  push:"),
      WORKFLOW.indexOf("  pull_request:")
    );
    expect(pushTrigger).toContain("paths-ignore:");
    expect(pushTrigger).not.toMatch(/-\s*"docs\/\*\*"/);
    expect(pushTrigger).not.toMatch(/-\s*"\*\*\.md"/);
  });

  it("does not let a docs-only push overwrite ci/latest with a green verdict", () => {
    // report-health's loop treats anything that is not failure/cancelled as
    // success, and a skipped job is neither. Without the has_code gate, the
    // first docs push after a red code run would report main healthy.
    const block = jobBlock(WORKFLOW, "report-health");
    expect(block).toMatch(/needs:\s*\[detect-changes,/);
    expect(block).toMatch(/needs\.detect-changes\.outputs\.has_code == 'true'/);
  });

  it("is gated by CI Gate, not advisory", () => {
    // A job that runs but is absent from ci-gate's needs merges invisibly
    // (#5003). scripts/check-ci-gate-coverage.mjs enforces this repo-wide;
    // asserted here too so this job's own purpose cannot be quietly defeated.
    const gate = jobBlock(WORKFLOW, "ci-gate");
    expect(gate).toContain(JOB);
    expect(gate).toMatch(/DOCS_FORMAT:\s*\$\{\{\s*needs\.docs-format\.result\s*\}\}/);
    expect(gate).toContain('"$DOCS_FORMAT"');
  });
});
