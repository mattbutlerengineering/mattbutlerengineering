import { describe, it, expect } from "vitest";
import { getJob, getStep, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const WORKFLOW = loadWorkflow("ci.yml");

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
 * Asserts on the parsed workflow (scripts/lib/workflow.mjs, #6393), so the
 * checks survive reformatting of the YAML.
 */
function requireJob(jobName) {
  const job = getJob(WORKFLOW, jobName);
  if (!job) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  return job;
}

const JOB = "docs-format";

describe("ci.yml docs-only formatting gate", () => {
  it("defines the job", () => {
    expect(() => requireJob(JOB)).not.toThrow();
  });

  it("runs the same prettier check the Build chain runs, not a hand-rolled subset", () => {
    // `pnpm check:prettier` is `prettier --check .` and is what repo-audit
    // calls. Re-implementing the glob here would let the two drift, which is
    // the class of bug this whole file exists for.
    expect(jobRunText(requireJob(JOB))).toMatch(/^pnpm check:prettier\s*$/m);
  });

  it("also runs the .cursorrules drift check, which an AGENTS.md-only PR can trip (#6854)", () => {
    // `.cursorrules` is generated from AGENTS.md (a docs file), so an
    // AGENTS.md-only edit is the one change that causes the drift AND skips
    // Build, where repo-audit would otherwise catch it (#6845 -> red main).
    // The check is a pure file compare and needs no CLI build.
    expect(jobRunText(requireJob(JOB))).toMatch(/^node scripts\/check-cursorrules-drift\.mjs\s*$/m);
  });

  it("runs exactly when the Build chain does NOT, so it is not redundant work", () => {
    const block = requireJob(JOB);
    expect(block.needs).toEqual(["detect-changes"]);
    expect(block.if).toMatch(/needs\.detect-changes\.outputs\.has_code != 'true'/);
  });

  it("also runs on a docs-only push to main, not just on PRs", () => {
    // Removing these two entries is the whole fix for #4664's actionable half.
    // If either comes back, a docs-only commit on main goes unchecked again
    // and reddens the next code PR's merge ref instead of its own run.
    const ignored = WORKFLOW.on.push["paths-ignore"];
    expect(ignored).toBeDefined();
    expect(ignored).not.toContain("docs/**");
    expect(ignored).not.toContain("**.md");
  });

  it("does not let a docs-only push overwrite ci/latest with a green verdict", () => {
    // report-health's loop treats anything that is not failure/cancelled as
    // success, and a skipped job is neither. Without the has_code gate, the
    // first docs push after a red code run would report main healthy.
    const block = requireJob("report-health");
    expect(block.needs).toContain("detect-changes");
    expect(block.if).toMatch(/needs\.detect-changes\.outputs\.has_code == 'true'/);
  });

  it("is gated by CI Gate, not advisory", () => {
    // A job that runs but is absent from ci-gate's needs merges invisibly
    // (#5003). scripts/check-ci-gate-coverage.mjs enforces this repo-wide;
    // asserted here too so this job's own purpose cannot be quietly defeated.
    const gate = requireJob("ci-gate");
    expect(gate.needs).toContain(JOB);
    // The result check hands the whole `needs` context to the fail-closed
    // module (scripts/ci-gate-required-results.mjs), so being in `needs:` is
    // what makes docs-format's result gate the merge.
    const check = getStep(gate, "Check required job results");
    expect(check.env.NEEDS_JSON).toMatch(/^\$\{\{\s*toJSON\(needs\)\s*\}\}$/);
    expect(check.run).toContain("node scripts/ci-gate-required-results.mjs");
  });
});
