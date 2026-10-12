/**
 * Structural guard for .github/workflows/claude.yml (#3585).
 *
 * The `@claude` comment trigger dispatches an agent run, which needs
 * `ANTHROPIC_API_KEY` — and CI is keyless by design (#3585, Option A). The
 * workflow had no credential gate: an authorized mention got "Working on it",
 * then `pnpm exec mbe agent run`, which can never resolve (the @mbe/cli bin is
 * never linked, and the job never built the CLI — gotchas § Build), then
 * "Agent run finished: failure" — while the job itself still reported success.
 * Its authorization guard `exit 0`ed for a non-collaborator, which ended only
 * that step: every later step still ran.
 *
 * The fix copies docs-audit.yml's preflight pattern (#5458): a preflight job
 * decides both "is the author authorized" and "is there a credential", and the
 * dispatch job is gated on those outputs, so it reports SKIPPED rather than a
 * success that did nothing. An authorized, keyless mention gets one short
 * comment saying why, so the person who typed @claude is not left unanswered.
 *
 * Structure is asserted on the parsed workflow (scripts/lib/workflow.mjs,
 * #6393); the one line-level untrusted-interpolation scan stays a raw-text
 * check on the file.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, getStep, jobRunText, loadWorkflow } from "../lib/workflow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/claude.yml"), "utf8");

const PARSED = loadWorkflow("claude.yml");

function jobOf(name) {
  const job = getJob(PARSED, name);
  expect(job, `claude.yml declares a \`${name}\` job`).not.toBeNull();
  return job;
}

function stepOf(job, stepName) {
  const step = getStep(job, stepName);
  expect(step, `step \`${stepName}\` exists`).not.toBeNull();
  return step;
}

describe("claude.yml gates its agent run on preflight job outputs, not step guards", () => {
  it("declares a preflight job that owns the mention filter and the collaborator check", () => {
    const preflight = jobOf("preflight");
    expect(preflight.if).toContain("contains(github.event.comment.body, '@claude')");
    expect(preflight.if).toContain("contains(github.event.review.body, '@claude')");
    const script = jobRunText(preflight);
    expect(script).toMatch(/collaborators\/\$COMMENT_AUTHOR\/permission/);
    expect(Object.keys(preflight.outputs)).toEqual(
      expect.arrayContaining(["authorized", "has_key"])
    );
    expect(script).toContain('echo "authorized=true" >> "$GITHUB_OUTPUT"');
    expect(script).toContain('echo "authorized=false" >> "$GITHUB_OUTPUT"');
    expect(getStep(preflight, "Check for an agent credential").env.ANTHROPIC_API_KEY).toBe(
      "${{ secrets.ANTHROPIC_API_KEY }}"
    );
    expect(script).toContain('echo "has_key=true" >> "$GITHUB_OUTPUT"');
    expect(script).toContain('echo "has_key=false" >> "$GITHUB_OUTPUT"');
    expect(script).toContain("$GITHUB_STEP_SUMMARY");
  });

  it("skips the dispatch job unless the author is authorized AND a credential exists", () => {
    const dispatch = jobOf("dispatch");
    expect(dispatch.needs).toEqual(["preflight"]);
    // Pin the whole job-level expression: an `||` in place of `&&` would let a
    // non-collaborator reach dispatch whenever a key exists, and a looser
    // match (any `if:` mentioning both outputs) cannot see that.
    expect(dispatch.if).toBe(
      "needs.preflight.outputs.authorized == 'true' && needs.preflight.outputs.has_key == 'true'"
    );
  });

  it("keeps every silent skip out of the dispatch steps — an exit 0 there reads as a pass", () => {
    expect(jobRunText(jobOf("dispatch"))).not.toMatch(/exit 0/);
    expect(jobRunText(jobOf("preflight"))).not.toMatch(/exit 0/);
  });

  it("builds the CLI and invokes its entrypoint, since `pnpm exec mbe` never resolves", () => {
    const dispatch = jobRunText(jobOf("dispatch"));
    expect(dispatch).not.toContain("pnpm exec mbe");
    const build = dispatch.indexOf("pnpm build --filter @mbe/cli...");
    const run = dispatch.indexOf("node tools/cli/dist/index.js agent run");
    expect(build, "dispatch builds the CLI").toBeGreaterThan(-1);
    expect(run, "dispatch invokes the built entrypoint").toBeGreaterThan(-1);
    expect(build).toBeLessThan(run);
  });

  it("fails the agent step when the agent run fails, so a failure is not a green job", () => {
    const agent = stepOf(jobOf("dispatch"), "Run agent");
    expect(agent.run).toContain('echo "outcome=failure" >> "$GITHUB_OUTPUT"');
    expect(agent.run).toMatch(/outcome=failure[^\n]*\n\s*exit 1/);
  });

  it("answers an authorized, keyless mention with one comment naming #3585 — and only then", () => {
    const skip = stepOf(jobOf("preflight"), "Explain the skip");
    // Whole expression again: with `||`, any commenter's @claude would get a bot reply.
    expect(skip.if).toBe(
      "steps.auth.outputs.authorized == 'true' && steps.check.outputs.has_key != 'true'"
    );
    expect(skip.run).toContain("gh issue comment");
    expect(skip.run).toContain("no agent credential in CI");
    expect(skip.run).toMatch(/#3585/);
    expect(jobRunText(jobOf("dispatch"))).not.toContain("no agent credential in CI");
  });

  it("never interpolates untrusted comment text into a shell script", () => {
    // Comment/review bodies and authors may only enter via env-var assignment;
    // the mention filter uses them inside `contains()`, a GH expression.
    const interpolations = WORKFLOW.split("\n").filter((line) =>
      /\$\{\{[^}]*github\.event\.(comment|review)\.(body|user)/.test(line)
    );
    expect(interpolations.length).toBeGreaterThan(0);
    for (const line of interpolations) {
      expect(line).toMatch(/^\s+(COMMENT_BODY|COMMENT_AUTHOR): \$\{\{/);
    }
  });
});
