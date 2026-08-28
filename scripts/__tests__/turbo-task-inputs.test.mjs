import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `@mbe/scripts`'s `test` / `test:coverage` turbo hashes must respond to the
 * files the suite actually reads — including files OUTSIDE `scripts/`.
 *
 * The defect this pins: root `turbo.json` declared no `inputs` for
 * `test:coverage`, so turbo hashed only the package's own files, and the task
 * hash was byte-identical before and after a mutation of
 * `apps/rialto-web/playwright.config.ts` — the file both visual-tolerance
 * guards (`visual-tolerance-guard.test.mjs`, `visual-defect-reproduction.test.mjs`)
 * exist to watch. Their soundness in CI was incidental: `ci.yml`'s `test` job
 * `needs: typecheck`, so typecheck saves the `github.sha`-keyed cache entry
 * first and `test` never gets to save a poisoned one (measured 0/29
 * `test:coverage` cache hits on `main`). Setting `TURBO_TOKEN` or dropping
 * that `needs:` would silently reopen the hole. `test` was worse still: root
 * inputs (`src/**`, `vitest.config.ts`) match nothing in `scripts/`, so its
 * hash ignored even the package's own sources.
 *
 * Second defect class (this PR's own first red CI run on #4644): explicit
 * turbo input globs do NOT respect .gitignore -- `$TURBO_DEFAULT$` does, extra
 * globs don't. Broad `apps/**`-style inputs hashed `.turbo/turbo-*.log` files
 * that turbo itself streams into sibling packages during a concurrent
 * unfiltered run (plus `node_modules/` and Prisma's `src/generated/**`), so
 * the hash moved mid-run under CI's `turbo test:coverage` while staying
 * deterministic under a local `--filter=@mbe/scripts` run. #4644 merged with
 * negations for node_modules/dist/coverage/test-results/playwright-report/
 * .turbo; the invariant test below pins the full property -- the resolved
 * input set may only contain paths nothing writes into at runtime -- so the
 * next glob edit fails deterministically here instead of flaking in CI.
 *
 * These tests probe the REAL hashing pipeline (`turbo --dry-run=json`), not
 * turbo.json's text: mutate a watched file (atomic rename, byte-checked
 * restore in `finally`), re-hash, assert the hash moved. `scripts/turbo.json`
 * (a turbo Package Configuration) is what makes them pass.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TURBO_BIN = join(ROOT, "node_modules", ".bin", "turbo");
const PLAYWRIGHT_CONFIG = join(ROOT, "apps/rialto-web/playwright.config.ts");
const OWN_SOURCE = join(ROOT, "scripts/visual-tolerance.mjs");

/**
 * Paths that build/test tooling writes into while a concurrent `turbo run` is
 * executing (all gitignored, all hashed anyway when an explicit glob matches
 * them): turbo's own per-task logs, package installs, coverage/junit output,
 * build dist, Storybook builds, Prisma client generation, Playwright
 * artifacts.
 */
const RUNTIME_WRITTEN_PATH =
  /(^|\/)(\.turbo|node_modules|coverage|test-results|dist|playwright-report|storybook-static)\/|src\/generated\//;

/** One dry-run returns both task hashes; nothing executes and nothing caches. */
function taskHashes() {
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: "1" };
  // Never let the probe talk to a remote cache, even if CI has one configured.
  delete env.TURBO_TOKEN;
  delete env.TURBO_TEAM;
  const stdout = execFileSync(
    TURBO_BIN,
    ["run", "test", "test:coverage", "--filter=@mbe/scripts", "--dry-run=json"],
    { cwd: ROOT, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 }
  );
  const { tasks } = JSON.parse(stdout);
  const hashOf = (taskId) => {
    const task = tasks.find((t) => t.taskId === taskId);
    if (!task) throw new Error(`dry-run has no task ${taskId}`);
    return task.hash;
  };
  return {
    test: hashOf("@mbe/scripts#test"),
    coverage: hashOf("@mbe/scripts#test:coverage"),
  };
}

/** Resolved input file list of `@mbe/scripts#test` from one extra dry-run. */
function testTaskInputPaths() {
  const env = { ...process.env, TURBO_TELEMETRY_DISABLED: "1" };
  delete env.TURBO_TOKEN;
  delete env.TURBO_TEAM;
  const stdout = execFileSync(
    TURBO_BIN,
    ["run", "test", "--filter=@mbe/scripts", "--dry-run=json"],
    { cwd: ROOT, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 }
  );
  const { tasks } = JSON.parse(stdout);
  const task = tasks.find((t) => t.taskId === "@mbe/scripts#test");
  if (!task) throw new Error("dry-run has no task @mbe/scripts#test");
  return Object.keys(task.inputs);
}

/**
 * Replace `target`'s contents via write-to-temp + rename so concurrent test
 * workers reading the same file (visual-tolerance*.test.mjs read the live
 * playwright config at module load) never observe a partial write.
 */
function atomicWrite(target, contents) {
  const tmp = join(dirname(target), `.turbo-input-probe-${process.pid}`);
  writeFileSync(tmp, contents);
  renameSync(tmp, target);
}

/** Append a semantically inert comment to `target`, run `fn`, restore byte-identically. */
function withAppendedProbe(target, fn) {
  const original = readFileSync(target);
  try {
    atomicWrite(
      target,
      Buffer.concat([
        original,
        Buffer.from(`\n// turbo-input-hash-probe ${process.pid}-${Date.now()}\n`),
      ])
    );
    return fn();
  } finally {
    atomicWrite(target, original);
    if (!readFileSync(target).equals(original)) {
      // Restore failure outranks any assertion error this masks: a dirty
      // working tree poisons every later hash comparison and git state.
      throw new Error(`failed to restore ${target} byte-identically`);
    }
  }
}

describe("@mbe/scripts turbo task hashes see the suite's real inputs", () => {
  const baseline = taskHashes();

  it("resolves no runtime-written paths into the hash (determinism under concurrent runs)", () => {
    // If this fails, an input glob in scripts/turbo.json matches a tree that
    // tooling writes into mid-run -- the hash will flap under an unfiltered
    // `turbo run` in CI even though every filtered local run looks stable.
    const offenders = testTaskInputPaths().filter((p) => RUNTIME_WRITTEN_PATH.test(p));
    expect(offenders).toEqual([]);
  });

  it(
    "test:coverage and test respond to apps/rialto-web/playwright.config.ts",
    { timeout: 120_000 },
    () => {
      const mutated = withAppendedProbe(PLAYWRIGHT_CONFIG, taskHashes);
      expect(mutated.coverage).not.toBe(baseline.coverage);
      expect(mutated.test).not.toBe(baseline.test);
      // A/B/A: after the byte-checked restore the hash must return to baseline,
      // proving the difference above came from the probe, not ambient churn.
      expect(taskHashes()).toEqual(baseline);
    }
  );

  it("test and test:coverage respond to the package's own sources", { timeout: 120_000 }, () => {
    const mutated = withAppendedProbe(OWN_SOURCE, taskHashes);
    expect(mutated.test).not.toBe(baseline.test);
    expect(mutated.coverage).not.toBe(baseline.coverage);
    expect(taskHashes()).toEqual(baseline);
  });
});
