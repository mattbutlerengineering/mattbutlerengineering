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
 * Text-level checks on the real workflow file, matching the house style
 * (docs-audit-workflow.test.mjs, scheduled-issue-completion-workflow.test.mjs).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/claude.yml"), "utf8");

/** The body of one top-level job block, from its key to the next job key. */
function jobBlock(name) {
  const start = WORKFLOW.indexOf(`\n  ${name}:\n`);
  expect(start, `claude.yml declares a \`${name}\` job`).toBeGreaterThan(-1);
  const next = WORKFLOW.slice(start + 1).search(/\n {2}[a-z][\w-]*:\n/);
  return next === -1 ? WORKFLOW.slice(start) : WORKFLOW.slice(start, start + 1 + next);
}

/** The body of one step (from its `- name:` line to the next step). */
function stepBlock(job, stepName) {
  const start = job.indexOf(`- name: ${stepName}`);
  expect(start, `step \`${stepName}\` exists`).toBeGreaterThan(-1);
  const next = job.slice(start + 1).search(/\n\s+- (name|uses):/);
  return next === -1 ? job.slice(start) : job.slice(start, start + 1 + next);
}

describe("claude.yml gates its agent run on preflight job outputs, not step guards", () => {
  it("declares a preflight job that owns the mention filter and the collaborator check", () => {
    const preflight = jobBlock("preflight");
    expect(preflight).toContain("contains(github.event.comment.body, '@claude')");
    expect(preflight).toContain("contains(github.event.review.body, '@claude')");
    expect(preflight).toMatch(/collaborators\/\$COMMENT_AUTHOR\/permission/);
    expect(preflight).toMatch(
      /outputs:[\s\S]*authorized:[\s\S]*has_key:|outputs:[\s\S]*has_key:[\s\S]*authorized:/
    );
    expect(preflight).toContain('echo "authorized=true" >> "$GITHUB_OUTPUT"');
    expect(preflight).toContain('echo "authorized=false" >> "$GITHUB_OUTPUT"');
    expect(preflight).toContain("ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}");
    expect(preflight).toContain('echo "has_key=true" >> "$GITHUB_OUTPUT"');
    expect(preflight).toContain('echo "has_key=false" >> "$GITHUB_OUTPUT"');
    expect(preflight).toContain("$GITHUB_STEP_SUMMARY");
  });

  it("skips the dispatch job unless the author is authorized AND a credential exists", () => {
    const dispatch = jobBlock("dispatch");
    expect(dispatch).toMatch(/needs: preflight/);
    // Pin the whole job-level line: an `||` in place of `&&` would let a
    // non-collaborator reach dispatch whenever a key exists, and a looser
    // match (any `if:` line mentioning both outputs) cannot see that.
    expect(dispatch).toMatch(
      /^ {4}if: needs\.preflight\.outputs\.authorized == 'true' && needs\.preflight\.outputs\.has_key == 'true'$/m
    );
  });

  it("keeps every silent skip out of the dispatch steps — an exit 0 there reads as a pass", () => {
    expect(jobBlock("dispatch")).not.toMatch(/exit 0/);
    expect(jobBlock("preflight")).not.toMatch(/exit 0/);
  });

  it("builds the CLI and invokes its entrypoint, since `pnpm exec mbe` never resolves", () => {
    const dispatch = jobBlock("dispatch");
    expect(dispatch).not.toContain("pnpm exec mbe");
    const build = dispatch.indexOf("pnpm build --filter @mbe/cli...");
    const run = dispatch.indexOf("node tools/cli/dist/index.js agent run");
    expect(build, "dispatch builds the CLI").toBeGreaterThan(-1);
    expect(run, "dispatch invokes the built entrypoint").toBeGreaterThan(-1);
    expect(build).toBeLessThan(run);
  });

  it("fails the agent step when the agent run fails, so a failure is not a green job", () => {
    const agent = stepBlock(jobBlock("dispatch"), "Run agent");
    expect(agent).toContain('echo "outcome=failure" >> "$GITHUB_OUTPUT"');
    expect(agent).toMatch(/outcome=failure[^\n]*\n\s*exit 1/);
  });

  it("answers an authorized, keyless mention with one comment naming #3585 — and only then", () => {
    const preflight = jobBlock("preflight");
    const skip = stepBlock(preflight, "Explain the skip");
    // Whole line again: with `||`, any commenter's @claude would get a bot reply.
    expect(skip).toMatch(
      /^\s+if: steps\.auth\.outputs\.authorized == 'true' && steps\.check\.outputs\.has_key != 'true'$/m
    );
    expect(skip).toContain("gh issue comment");
    expect(skip).toContain("no agent credential in CI");
    expect(skip).toMatch(/#3585/);
    expect(jobBlock("dispatch")).not.toContain("no agent credential in CI");
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
