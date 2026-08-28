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
 * These tests probe the REAL hashing pipeline (`turbo --dry-run=json`), not
 * turbo.json's text: mutate a watched file (atomic rename, byte-checked
 * restore in `finally`), re-hash, assert the hash moved. `scripts/turbo.json`
 * (a turbo Package Configuration) is what makes them pass.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TURBO_BIN = join(ROOT, "node_modules", ".bin", "turbo");
const PLAYWRIGHT_CONFIG = join(ROOT, "apps/rialto-web/playwright.config.ts");
const OWN_SOURCE = join(ROOT, "scripts/visual-tolerance.mjs");

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
  let result;
  let fnError;
  try {
    atomicWrite(
      target,
      Buffer.concat([
        original,
        Buffer.from(`\n// turbo-input-hash-probe ${process.pid}-${Date.now()}\n`),
      ])
    );
    result = fn();
  } catch (error) {
    fnError = error;
  } finally {
    atomicWrite(target, original);
  }
  if (!readFileSync(target).equals(original)) {
    // Restore failure outranks any assertion error from `fn`: a dirty working
    // tree poisons every later hash comparison and git state. The outranked
    // error rides along as `cause` instead of being swallowed (the previous
    // throw-in-finally form masked it entirely — no-unsafe-finally).
    throw new Error(`failed to restore ${target} byte-identically`, { cause: fnError });
  }
  if (fnError) throw fnError;
  return result;
}

describe("@mbe/scripts turbo task hashes see the suite's real inputs", () => {
  const baseline = taskHashes();

  it("test:coverage and test respond to apps/rialto-web/playwright.config.ts", () => {
    const mutated = withAppendedProbe(PLAYWRIGHT_CONFIG, taskHashes);
    expect(mutated.coverage).not.toBe(baseline.coverage);
    expect(mutated.test).not.toBe(baseline.test);
    // A/B/A: after the byte-checked restore the hash must return to baseline,
    // proving the difference above came from the probe, not ambient churn.
    expect(taskHashes()).toEqual(baseline);
  });

  it("test and test:coverage respond to the package's own sources", () => {
    const mutated = withAppendedProbe(OWN_SOURCE, taskHashes);
    expect(mutated.test).not.toBe(baseline.test);
    expect(mutated.coverage).not.toBe(baseline.coverage);
    expect(taskHashes()).toEqual(baseline);
  });
});
