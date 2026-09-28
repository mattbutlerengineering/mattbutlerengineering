import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Local turbo cache reuse for CI (#4504), plus real remote caching (#3388).
 *
 * `turbo.json` pins `cacheDir: ".turbo/cache"` (#3786); #4504 added an
 * `actions/cache` step that restores/saves that whole directory in each
 * turbo-orchestrated job, keyed on the `pnpm-lock.yaml` hash so a
 * lockfile-touching PR (a turbo `globalDependencies` entry) rotates the key
 * instead of restoring a stale cache across the change that invalidates
 * every task (see .claude/rules/gotchas.md § CI, the pnpm-lock.yaml cold-run
 * entry). That step stays as a cheap same-run bulk restore.
 *
 * #3388 activated real per-task remote caching (`turbo.json`'s
 * `remoteCache.enabled: true`) via `rharkor/caching-for-turbo` — a
 * GitHub-Actions-cache-backed proxy that needs no Vercel account or
 * `TURBO_TOKEN` secret. This replaced the old, permanently-inert
 * `TURBO_TOKEN`/`TURBO_TEAM` (Vercel) wiring: the `prepare` job's
 * `if: env.TURBO_TOKEN != ''`-guarded `turbo login`/`turbo link` steps are
 * gone, along with the per-step `TURBO_TOKEN`/`TURBO_TEAM` env overrides
 * that would otherwise clobber the values the new action exports.
 *
 * Parsed textually rather than with a YAML library, matching the precedent
 * in pulumi-cli-pin.test.mjs / ci-node-matrix.test.mjs: nothing in
 * `scripts/` depends on a YAML parser, and these are plain scalar/expression
 * lines with no anchors or flow mappings to get wrong.
 */
function jobBlock(source, jobName) {
  const lines = source.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^ {2}${jobName}:\\s*$`).test(l));
  if (start === -1) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  const blockLines = end === -1 ? rest : rest.slice(0, end);
  return blockLines.join("\n");
}

/**
 * Isolate the single `steps:` entry (a `- name:` … `uses:` … `with:` block)
 * that mounts `.turbo/cache`, so `key:`/`restore-keys:` assertions can't
 * accidentally match the unrelated "Restore Prisma clients" step's `key:`
 * line sitting in the same job.
 */
function turboCacheStep(block) {
  const lines = block.split("\n");
  const pathIdx = lines.findIndex((l) => /path:\s*\.turbo\/cache/.test(l));
  if (pathIdx === -1) return undefined;
  let stepStart = pathIdx;
  while (stepStart > 0 && !/^\s*- name:/.test(lines[stepStart])) stepStart--;
  let stepEnd = pathIdx + 1;
  while (stepEnd < lines.length && !/^\s*- name:/.test(lines[stepEnd])) stepEnd++;
  return lines.slice(stepStart, stepEnd).join("\n");
}

const CACHE_JOBS = ["build", "test", "typecheck"];

describe("ci.yml turbo caching (local + remote)", () => {
  for (const job of CACHE_JOBS) {
    const block = jobBlock(WORKFLOW, job);
    const step = turboCacheStep(block);

    it(`${job} job restores/saves .turbo/cache via actions/cache`, () => {
      expect(step).toBeDefined();
      expect(step).toMatch(/uses:\s*actions\/cache@/);
      expect(step).toMatch(/path:\s*\.turbo\/cache/);
    });

    it(`${job} job's cache key includes the pnpm-lock.yaml hash and sha`, () => {
      const keyLine = step?.split("\n").find((l) => /^\s*key:/.test(l));
      expect(keyLine).toBeDefined();
      expect(keyLine).toMatch(/turbo/);
      expect(keyLine).toMatch(/hashFiles\(\s*['"]pnpm-lock\.yaml['"]\s*\)/);
      expect(keyLine).toMatch(/github\.sha/);
    });

    it(`${job} job's restore-keys let a PR reuse a prior run's cache, scoped to the lockfile hash`, () => {
      const restoreKeysLine = step?.split("\n").find((l) => /^\s*restore-keys:/.test(l));
      expect(restoreKeysLine).toBeDefined();
    });
  }

  it("removes the dead Vercel TURBO_TOKEN login/link guards", () => {
    // #3388 replaced the always-inert (TURBO_TOKEN secret never set)
    // Vercel-token remote-cache path with rharkor/caching-for-turbo below.
    // The old guarded steps must not come back — they'd sit dead again,
    // and if `prepare` ever reacquired a raw TURBO_TOKEN/TURBO_TEAM job env
    // it would clobber the fixed values the new action exports.
    expect(WORKFLOW).not.toMatch(/if: env\.TURBO_TOKEN != ''/);
    expect(WORKFLOW).not.toMatch(/turbo login --token/);
    expect(WORKFLOW).not.toMatch(/turbo link --team/);
  });

  const REMOTE_CACHE_JOBS = ["lint", "typecheck", "build", "test"];

  for (const job of REMOTE_CACHE_JOBS) {
    it(`${job} job runs the pinned GitHub-Actions-backed turbo remote cache action`, () => {
      const block = jobBlock(WORKFLOW, job);
      expect(block).toMatch(/uses:\s*rharkor\/caching-for-turbo@[0-9a-f]{40}\s*#/);
    });
  }

  it("pins rharkor/caching-for-turbo to the same commit SHA everywhere it's used", () => {
    const pins = [...WORKFLOW.matchAll(/uses:\s*rharkor\/caching-for-turbo@([0-9a-f]{40})/g)].map(
      (m) => m[1]
    );
    expect(pins.length).toBeGreaterThanOrEqual(REMOTE_CACHE_JOBS.length);
    expect(new Set(pins).size).toBe(1);
  });
});
