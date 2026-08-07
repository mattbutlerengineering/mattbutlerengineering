#!/usr/bin/env node

/**
 * Fails when a test file is not reachable by the test runner CI actually runs.
 *
 * CI's Test job runs `pnpm turbo test:coverage`, and turbo only knows about
 * pnpm workspace packages. A directory full of green tests that is *not* a
 * workspace package therefore never runs in CI — it looks protected (the files
 * exist, they pass locally, coverage tooling ignores them) while contributing
 * exactly nothing to the merge gate.
 *
 * `infrastructure/worker` sat in that state with 245 passing tests covering the
 * production edge router — CSP headers, rate limiting, circuit breaking, origin
 * routing — none of which had ever run in CI. The failure mode is silent by
 * construction: nothing is red, the tests simply never execute.
 *
 * The rule: every test file must live under a workspace package whose
 * package.json declares a `test` script. Anything else is an orphan and must
 * either be wired in or added to ALLOWLIST with a reason.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { discoverWorkspaceGlobs, resolveGlob, root } from "./dep-graph-discovery.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/** Test files this check is responsible for. */
export const TEST_FILE_RE = /\.(test|spec)\.(js|mjs|cjs|ts|tsx)$/;

/** Directories never worth walking into. */
export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  "generated",
  "graphify-out",
  "test-results",
  "playwright-report",
]);

/**
 * Test files that legitimately run outside `turbo test`. Each entry needs a
 * reason naming the thing that *does* run it — an allowlist entry without a
 * runner is just an orphan with paperwork.
 */
export const ALLOWLIST = [
  {
    prefix: "tests/smoke/",
    reason:
      "Playwright post-deploy smoke suite — run by .github/workflows/post-deploy-check.yml against the deployed site, not by turbo.",
  },
  {
    prefix: "plugins/acmm/",
    reason:
      "node:test suite (286 tests), not vitest — turbo cannot run it as-is. Wiring tracked separately; remove this entry when the plugin becomes a workspace package.",
  },
];

/**
 * Recursively collect test files under a directory, relative to `from`.
 *
 * @param {string} dir - Absolute directory to walk.
 * @param {string} from - Absolute path that results are made relative to.
 * @param {Set<string>} [skipDirs]
 * @returns {string[]} POSIX-style relative paths.
 */
export function collectTestFiles(dir, from, skipDirs = SKIP_DIRS) {
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectTestFiles(entryPath, from, skipDirs));
    } else if (TEST_FILE_RE.test(entry.name)) {
      found.push(relative(from, entryPath).split(sep).join("/"));
    }
  }
  return found.sort();
}

/**
 * Workspace directories whose package.json declares a `test` script — the set
 * `turbo test` will actually execute.
 *
 * @param {string} [repoRoot]
 * @returns {string[]} Relative workspace dirs (e.g. "packages/rialto").
 */
export function findRunnableWorkspaceDirs(repoRoot = root) {
  return discoverWorkspaceGlobs(repoRoot)
    .flatMap((glob) => resolveGlob(glob, repoRoot))
    .filter(({ pkgJsonPath }) => {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      return Boolean(pkg.scripts?.test);
    })
    .map(({ wsDir }) => wsDir);
}

/** True when `file` sits inside `dir`. */
function isUnder(file, dir) {
  return file === dir || file.startsWith(`${dir}/`);
}

/**
 * Partition test files into orphans and allowlisted-but-absent entries.
 *
 * @param {object} input
 * @param {string[]} input.testFiles - Repo-relative test file paths.
 * @param {string[]} input.runnableDirs - Workspace dirs with a `test` script.
 * @param {{ prefix: string; reason: string }[]} [input.allowlist]
 * @returns {{ orphans: string[]; staleAllowlist: string[] }}
 */
export function findOrphanedTests({ testFiles, runnableDirs, allowlist = ALLOWLIST }) {
  const orphans = [];
  const usedPrefixes = new Set();

  for (const file of testFiles) {
    const allowed = allowlist.find((entry) => file.startsWith(entry.prefix));
    if (allowed) {
      usedPrefixes.add(allowed.prefix);
      continue;
    }
    if (!runnableDirs.some((dir) => isUnder(file, dir))) orphans.push(file);
  }

  const staleAllowlist = allowlist
    .map((entry) => entry.prefix)
    .filter((prefix) => !usedPrefixes.has(prefix));

  return { orphans, staleAllowlist };
}

export const FAIL_MESSAGE =
  "FAIL: Some test files are never run by CI.\n" +
  "`turbo test` only sees pnpm workspace packages, so a test directory outside\n" +
  "one passes locally and silently contributes nothing to the merge gate.\n" +
  "Wire it in as a workspace package with a `test` script (see\n" +
  "infrastructure/worker), or add it to ALLOWLIST in\n" +
  "scripts/check-orphaned-tests.mjs naming the runner that does execute it.\n" +
  "A stale ALLOWLIST entry is reported too — an exemption must not outlive its reason.";

/**
 * Flatten a scan result into findings for the shared fitness-check reporter.
 * Orphans collapse to their directory: one line per gap, not per file.
 *
 * @param {{ orphans: string[]; staleAllowlist: string[] }} result
 * @returns {{ kind: "orphan" | "stale-allowlist"; path: string; count?: number }[]}
 */
export function toFindings({ orphans, staleAllowlist }) {
  const byDir = new Map();
  for (const file of orphans) {
    const dir = file.split("/").slice(0, -1).join("/");
    byDir.set(dir, (byDir.get(dir) ?? 0) + 1);
  }

  return [
    ...[...byDir.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, count]) => ({ kind: /** @type {const} */ ("orphan"), path, count })),
    ...staleAllowlist.map((path) => ({
      kind: /** @type {const} */ ("stale-allowlist"),
      path,
    })),
  ];
}

/**
 * @param {{ kind: string; path: string; count?: number }} finding
 * @returns {string}
 */
export function formatFinding(finding) {
  return finding.kind === "orphan"
    ? `${finding.path}/ — ${finding.count} test file(s) never run by CI`
    : `ALLOWLIST entry "${finding.path}" matches no test file — remove it`;
}

/* c8 ignore start -- CLI entrypoint, exercised via repo-audit not unit tests */
const isMain = process.argv[1] && process.argv[1].endsWith("check-orphaned-tests.mjs");

if (isMain) {
  const findings = toFindings(
    findOrphanedTests({
      testFiles: collectTestFiles(root, root),
      runnableDirs: findRunnableWorkspaceDirs(),
    })
  );

  process.exit(
    runCheck({
      name: "orphaned test files",
      findings,
      formatFinding,
      passMessage: "PASS: Every test file lives under a workspace package that CI runs.",
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
