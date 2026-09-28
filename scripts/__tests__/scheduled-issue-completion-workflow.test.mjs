/**
 * Structural guard for .github/workflows/scheduled-issue-completion.yml (#3585).
 *
 * The routine's agent run needs `ANTHROPIC_API_KEY`, and CI is keyless by
 * design (#3585, Option A). The workflow used to decide that inside the
 * `Run agent` step: warn, write `outcome=skipped`, `exit 0`. The job then
 * reported SUCCESS twice a day — sixty consecutive "successes" from
 * 2026-08-23 — for a routine that never once ran.
 *
 * The fix copies docs-audit.yml's preflight pattern (#5458): a job output
 * decides, so the `routine` job reports SKIPPED instead. These tests exist
 * because that distinction is invisible in a green run — the failure mode is
 * silence, not noise.
 *
 * Text-level checks on the real workflow file, matching the house style
 * (docs-audit-workflow.test.mjs, metrics-collectors-workflow.test.mjs).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/scheduled-issue-completion.yml"),
  "utf8"
);

/** The body of one top-level job block, from its key to the next job key. */
function jobBlock(name) {
  const start = WORKFLOW.indexOf(`\n  ${name}:\n`);
  expect(start, `scheduled-issue-completion.yml declares a \`${name}\` job`).toBeGreaterThan(-1);
  const next = WORKFLOW.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? WORKFLOW.slice(start) : WORKFLOW.slice(start, start + 1 + next);
}

describe("scheduled-issue-completion gates its agent run on a job output, not a step guard", () => {
  it("declares a preflight job that publishes whether the credential exists", () => {
    const preflight = jobBlock("preflight");
    expect(preflight).toMatch(/outputs:\s*\n\s*has_key:/);
    expect(preflight).toContain("ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
    expect(preflight).toContain('echo "has_key=true" >> "$GITHUB_OUTPUT"');
    expect(preflight).toContain('echo "has_key=false" >> "$GITHUB_OUTPUT"');
  });

  it("skips the routine job on a missing credential rather than passing it", () => {
    const routine = jobBlock("routine");
    expect(routine).toMatch(/needs: preflight/);
    expect(routine).toMatch(/if:.*needs\.preflight\.outputs\.has_key == 'true'/);
  });

  it("keeps the old silent-skip out of the step — an exit 0 there reads as a pass", () => {
    const routine = jobBlock("routine");
    expect(routine).not.toMatch(/ANTHROPIC_API_KEY is not configured/);
    expect(routine).not.toMatch(/exit 0/);
    expect(routine).not.toMatch(/outcome=skipped/);
  });

  it("says in the run summary that the routine did not run, so a skip is legible", () => {
    const preflight = jobBlock("preflight");
    expect(preflight).toContain("$GITHUB_STEP_SUMMARY");
    expect(preflight).toMatch(/#3585/);
  });

  it("still invokes the built CLI entrypoint when a credential exists", () => {
    // The @mbe/cli bin is never linked into node_modules/.bin (gotchas § Build),
    // so `pnpm exec mbe` cannot resolve — the built entrypoint is the only path.
    const routine = jobBlock("routine");
    expect(routine).toContain("pnpm build --filter @mbe/cli...");
    expect(routine).toContain("node tools/cli/dist/index.js agent run");
    expect(routine).not.toContain("pnpm exec mbe");
  });
});
