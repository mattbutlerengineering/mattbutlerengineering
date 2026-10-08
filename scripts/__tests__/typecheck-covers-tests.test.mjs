import { beforeAll, describe, expect, it } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { discoverWorkspaceGlobs, resolveGlob } from "../dep-graph-discovery.mjs";

/**
 * Every tracked TS/TSX test file in a workspace package must be a root file of
 * at least one tsc project that the package's own `typecheck` script runs.
 *
 * Why: vitest strips types and never checks them, so a test excluded from
 * `tsc` can assert against a mock shape the code no longer has and still pass.
 * Until docs/fixes/test-typecheck-coverage, most library packages excluded
 * `src/**\/*.test.ts` in the same tsconfig.json their `typecheck` script used,
 * and two "fixes" were silently inert: packages/api-client's tsconfig.test.json
 * set `include` but inherited the base `exclude` (covering 0 of 19 tests), and
 * packages/service-bootstrap's test config listed a single file.
 *
 * That is why this guard asks tsc itself (`tsc --showConfig -p <project>`,
 * whose `files` array is the include/exclude/extends resolution tsc will
 * type-check) instead of grepping tsconfig text for "exclude": inherited
 * excludes and `extends` chains are invisible to a grep.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const execFileAsync = promisify(execFile);

/**
 * TEMPORARY sequencing list for the PR plan in
 * docs/fixes/test-typecheck-coverage/defect.md § Work items (six PRs) — NOT an
 * allowlist. Each key is a package directory, a single test file, or a
 * directory prefix ending in "/" (matches every test file under it); each value
 * names the PR of that run that brings it under typecheck. A listed entry must
 * still be uncovered (a stale entry fails below), and the run's final PR
 * empties and deletes this list.
 */
const PENDING_IN_THIS_RUN = new Map([
  // Found by this guard at PR1, not in Capture's table: tsconfig.json excludes
  // all of src/showcase, and the test drags in showcase sources with 27
  // non-test prop-drift errors. Routed in defect.md § Notes (2026-10-08).
  // PR6 — assigned its own PR by Matt, 2026-10-08 (autorun-brief.md).
  ["packages/rialto/src/showcase/App.vibes.test.tsx", "PR6"],
]);

const TS_TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts)$/;

/** Whether a PENDING_IN_THIS_RUN key names this test file (exactly, or as a "/"-ended prefix). */
function pendingKeyMatches(key, file) {
  return key.endsWith("/") ? file.startsWith(key) : key === file;
}

function isPendingFile(file) {
  return [...PENDING_IN_THIS_RUN.keys()].some((key) => pendingKeyMatches(key, file));
}

/**
 * The tsc projects a `typecheck` script runs, in order. Handles `&&`/`;`
 * chains and env-var prefixes (`NODE_OPTIONS=… tsc --noEmit`). A `tsc` with
 * no `-p`/`--project` runs `tsconfig.json`. Throws on anything it cannot
 * resolve, so an unfamiliar script shape fails loudly instead of passing.
 *
 * @param {string} script
 * @returns {string[]} project paths, relative to the package directory
 */
export function tscProjectsOf(script) {
  const projects = [];
  for (const segment of script.split(/&&|\|\||;/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const tscAt = tokens.findIndex((t) => t === "tsc" || t.endsWith("/tsc"));
    if (tscAt === -1) continue;
    const args = tokens.slice(tscAt + 1);
    if (args.some((a) => a === "-b" || a === "--build")) {
      throw new Error(`tsc --build is not supported by this guard: ${script}`);
    }
    const pAt = args.findIndex((a) => a === "-p" || a === "--project");
    if (pAt !== -1 && !args[pAt + 1]) throw new Error(`-p without a project: ${script}`);
    projects.push(pAt === -1 ? "tsconfig.json" : args[pAt + 1]);
  }
  if (projects.length === 0) throw new Error(`no tsc invocation found in: ${script}`);
  return projects;
}

/** Absolute root files tsc resolves for one project (include/exclude/extends applied). */
async function rootFilesOf(pkgDir, project) {
  const projectPath = resolve(pkgDir, project);
  const configPath =
    existsSync(projectPath) && !projectPath.endsWith(".json")
      ? join(projectPath, "tsconfig.json")
      : projectPath;
  if (!existsSync(configPath)) throw new Error(`${relative(ROOT, configPath)} does not exist`);
  const tsc = resolveTsc(pkgDir);
  const { stdout } = await execFileAsync(
    process.execPath,
    [tsc, "--showConfig", "-p", configPath],
    {
      cwd: pkgDir,
      maxBuffer: 64 * 1024 * 1024,
    }
  );
  const files = JSON.parse(stdout).files ?? [];
  return files.map((f) => resolve(dirname(configPath), f));
}

/** The typescript the package's own `tsc` resolves to, else the scripts package's. */
function resolveTsc(pkgDir) {
  for (const from of [pkgDir, join(ROOT, "scripts")]) {
    try {
      return createRequire(join(from, "package.json")).resolve("typescript/bin/tsc");
    } catch {
      // try the next location
    }
  }
  throw new Error(`no typescript resolvable from ${relative(ROOT, pkgDir)} or scripts/`);
}

function trackedTestFiles(wsDir) {
  const out = execFileSync("git", ["ls-files", "-z", "--", wsDir], { cwd: ROOT, encoding: "utf8" });
  return out.split("\0").filter((f) => TS_TEST_FILE.test(f));
}

/** @returns {Promise<Map<string, { tests: string[], uncovered: string[], error?: string }>>} */
async function measureCoverage() {
  const packages = discoverWorkspaceGlobs(ROOT).flatMap((g) => resolveGlob(g, ROOT));
  const results = new Map();
  await Promise.all(
    packages.map(async ({ wsDir, pkgJsonPath }) => {
      const tests = trackedTestFiles(wsDir);
      if (tests.length === 0) return;
      const script = JSON.parse(readFileSync(pkgJsonPath, "utf8")).scripts?.typecheck;
      if (!script) {
        results.set(wsDir, { tests, uncovered: tests, error: "no typecheck script" });
        return;
      }
      try {
        const pkgDir = join(ROOT, wsDir);
        const covered = new Set(
          (await Promise.all(tscProjectsOf(script).map((p) => rootFilesOf(pkgDir, p)))).flat()
        );
        const uncovered = tests.filter((t) => !covered.has(join(ROOT, t)));
        results.set(wsDir, { tests, uncovered });
      } catch (error) {
        results.set(wsDir, { tests, uncovered: tests, error: String(error.message ?? error) });
      }
    })
  );
  return results;
}

describe("tscProjectsOf", () => {
  it("defaults a bare tsc to tsconfig.json and strips env prefixes", () => {
    expect(tscProjectsOf("NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit")).toEqual([
      "tsconfig.json",
    ]);
  });

  it("collects every project in a chain", () => {
    expect(tscProjectsOf("tsc --noEmit && tsc --noEmit -p tsconfig.test.json")).toEqual([
      "tsconfig.json",
      "tsconfig.test.json",
    ]);
    expect(tscProjectsOf("tsc --noEmit --project tsconfig.test.json")).toEqual([
      "tsconfig.test.json",
    ]);
  });

  it("refuses scripts it cannot resolve rather than passing them", () => {
    expect(() => tscProjectsOf("vitest --typecheck")).toThrow(/no tsc invocation/);
    expect(() => tscProjectsOf("tsc -b")).toThrow(/--build is not supported/);
  });
});

describe("every workspace TS test file is type-checked by its package's typecheck script", () => {
  /** @type {Map<string, { tests: string[], uncovered: string[], error?: string }>} */
  let coverage;

  beforeAll(async () => {
    coverage = await measureCoverage();
  }, 120_000);

  it("finds the workspace's test files at all (the probe itself works)", () => {
    expect(coverage.size).toBeGreaterThan(10);
    expect(coverage.get("packages/types")?.uncovered).toEqual([]);
  });

  it("leaves no tracked test file outside every typecheck project", () => {
    const offenders = Object.fromEntries(
      [...coverage]
        .filter(([wsDir]) => !PENDING_IN_THIS_RUN.has(wsDir))
        .map(([wsDir, r]) => [wsDir, r, r.uncovered.filter((f) => !isPendingFile(f))])
        .filter(([, , uncovered]) => uncovered.length > 0)
        .map(([wsDir, r, uncovered]) => [
          wsDir,
          r.error
            ? `${r.error} (${r.tests.length} tests)`
            : uncovered.map((f) => relative(wsDir, f)),
        ])
    );
    expect(offenders).toEqual({});
  });

  it("has no stale PENDING_IN_THIS_RUN entry (a fixed package or file must leave the list)", () => {
    const uncoveredFiles = [...coverage.values()].flatMap((r) => r.uncovered);
    const stale = [...PENDING_IN_THIS_RUN.keys()].filter((key) =>
      coverage.has(key)
        ? coverage.get(key).uncovered.length === 0
        : !uncoveredFiles.some((f) => pendingKeyMatches(key, f))
    );
    expect(stale).toEqual([]);
  });
});
