import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getJob, loadWorkflow } from "../lib/workflow.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");
const PARSED = loadWorkflow("ci.yml");

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
 * Job/step structure is asserted on the parsed workflow
 * (scripts/lib/workflow.mjs, #6393). The few checks about YAML comments (a
 * parser drops them) and file-wide absences stay raw-text checks on WORKFLOW.
 */
function jobOf(jobName) {
  const job = getJob(PARSED, jobName);
  if (!job) throw new Error(`ci.yml has no top-level \`${jobName}:\` job`);
  return job;
}

/**
 * The single step that mounts `.turbo/cache`, so `key:`/`restore-keys:`
 * assertions can't accidentally match the unrelated "Restore Prisma clients"
 * step's `key:` sitting in the same job.
 */
function turboCacheStep(job) {
  return job.steps.find((s) => String(s.with.path ?? "").includes(".turbo/cache"));
}

const CACHE_JOBS = ["build", "test", "typecheck", "rls-integration"];

describe("ci.yml turbo caching (local + remote)", () => {
  for (const job of CACHE_JOBS) {
    const step = turboCacheStep(jobOf(job));

    it(`${job} job restores/saves .turbo/cache via actions/cache`, () => {
      expect(step).toBeDefined();
      expect(step.uses).toMatch(/^actions\/cache@/);
      expect(step.with.path).toMatch(/\.turbo\/cache/);
    });

    it(`${job} job's cache key includes the pnpm-lock.yaml hash and sha`, () => {
      const keyLine = step?.with.key;
      expect(keyLine).toBeDefined();
      expect(keyLine).toMatch(/turbo/);
      expect(keyLine).toMatch(/hashFiles\(\s*['"]pnpm-lock\.yaml['"]\s*\)/);
      expect(keyLine).toMatch(/github\.sha/);
    });

    it(`${job} job's restore-keys let a PR reuse a prior run's cache, scoped to the lockfile hash`, () => {
      expect(step?.with["restore-keys"]).toBeDefined();
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

  const REMOTE_CACHE_JOBS = ["lint", "typecheck", "build", "test", "rls-integration"];

  for (const job of REMOTE_CACHE_JOBS) {
    it(`${job} job runs the pinned GitHub-Actions-backed turbo remote cache action`, () => {
      const uses = jobOf(job).steps.map((s) => s.uses ?? "");
      expect(uses.some((u) => /^rharkor\/caching-for-turbo@[0-9a-f]{40}$/.test(u))).toBe(true);
    });
  }

  it("annotates every rharkor/caching-for-turbo pin with a trailing version comment", () => {
    // Raw-text check: a YAML parser drops comments.
    const uses = WORKFLOW.split("\n").filter((l) => /uses:\s*rharkor\/caching-for-turbo@/.test(l));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) expect(line).toMatch(/@[0-9a-f]{40}\s*#/);
  });

  it("pins rharkor/caching-for-turbo to the same commit SHA everywhere it's used", () => {
    const pins = [...WORKFLOW.matchAll(/uses:\s*rharkor\/caching-for-turbo@([0-9a-f]{40})/g)].map(
      (m) => m[1]
    );
    expect(pins.length).toBeGreaterThanOrEqual(REMOTE_CACHE_JOBS.length);
    expect(new Set(pins).size).toBe(1);
  });
});
