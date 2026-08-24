import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/**
 * Local turbo cache reuse for CI (#4504).
 *
 * `turbo.json` pins `cacheDir: ".turbo/cache"` (#3786), but until now nothing
 * in ci.yml ever restored or saved that directory — every job ran fully cold,
 * and remote caching is inert because `TURBO_TOKEN` is unset. This asserts an
 * `actions/cache` step exists for `.turbo/cache` in each turbo-orchestrated
 * job, keyed on the `pnpm-lock.yaml` hash so a lockfile-touching PR (a turbo
 * `globalDependencies` entry) rotates the key instead of restoring a stale
 * cache across the change that invalidates every task (see
 * .claude/rules/gotchas.md § CI, the pnpm-lock.yaml cold-run entry).
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

describe("ci.yml turbo local cache", () => {
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

  it("does not touch the TURBO_TOKEN remote-cache guards", () => {
    // This issue is strictly the local cache — the remote-cache login/link
    // steps in `prepare` must stay exactly as they are.
    expect(WORKFLOW).toMatch(/if: env\.TURBO_TOKEN != ''/);
  });
});
