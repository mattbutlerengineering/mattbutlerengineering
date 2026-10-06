import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Lint stays off the PR critical path, and stays a gate.
 *
 * Build and Test take ~10 min each and used to wait for Lint (~2-3 min of
 * ESLint) before starting, although Lint produces nothing they consume: the
 * `^build` outputs they reuse from turbo's cache are produced by Typecheck,
 * which runs the same `^build` dependency chain and finishes in ~30s. On run
 * 35909626065, Build/Test started at 19:33:04, 2 min after Typecheck (19:30:33)
 * finished, purely because they were waiting on Lint (19:33:02).
 *
 * Quality is unchanged because CI Gate still needs `lint`, and
 * ci-gate-required-results.mjs fails closed on anything but success/skipped.
 * Parsed textually, matching ci-turbo-cache.test.mjs.
 */
function needsOf(jobName) {
  const lines = WORKFLOW.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  const block = rest.slice(0, end === -1 ? undefined : end).join("\n");
  const match = block.match(/^ {4}needs:\s*\[([^\]]*)\]/m);
  if (!match) throw new Error(`\`${jobName}\` has no inline needs list`);
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("ci.yml lint critical path", () => {
  it.each(["build", "test", "migrations", "rls-integration"])(
    "%s does not wait for lint",
    (job) => {
      expect(needsOf(job)).not.toContain("lint");
      expect(needsOf(job)).toContain("typecheck");
    }
  );

  it("CI Gate still requires lint", () => {
    expect(needsOf("ci-gate")).toContain("lint");
  });
});
