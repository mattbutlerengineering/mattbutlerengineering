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
 * The rule: every `*.test.*` file must live under a workspace package whose
 * package.json declares a `test` script. Anything else is an orphan and must
 * either be wired in or added to ALLOWLIST with a reason.
 *
 * Scope — `*.test.*` only, deliberately. In this repo `.test.*` is the vitest
 * convention and `.spec.*` is the Playwright one: every `*.spec.*` file in the
 * workspace (31 under `apps/*&#47;e2e/**`, plus rialto's visual suite) is a
 * Playwright spec run by its own workflow, and no package's vitest `include`
 * glob matches `.spec.*` at all. Checking directory reachability for those
 * would report "covered by turbo test" about files turbo never runs.
 *
 * Known limitation of that scope: a `.spec.*` file dropped inside a workspace
 * package *expecting* vitest to pick it up is not caught here — the package's
 * vitest `include` glob wouldn't match it either, so it would silently never
 * run. Closing that needs per-package glob evaluation rather than directory
 * reachability; see the issue trail on #3911.
 */

import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";

import { discoverWorkspaceGlobs, resolveGlob, root } from "./dep-graph-discovery.mjs";
import { walkFiles, DEFAULT_IGNORE_DIRS } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/**
 * Test files this check is responsible for — the vitest convention only.
 * See the scope note in the module docblock for why `.spec.*` is excluded.
 */
export const TEST_FILE_RE = /\.test\.(js|mjs|cjs|ts|tsx)$/;

/**
 * Build-output directories the shared ignore list doesn't cover. The shared set
 * already handles node_modules, dist, generated, .git, .claude, .agent-worktrees,
 * coverage, .turbo and .stryker-tmp — and `walkFiles` additionally refuses to
 * descend into nested git worktrees, whose `.git` is a *file* rather than a
 * directory and so cannot be excluded by name (#3884, #3890).
 */
export const IGNORE_DIRS = new Set([
  ...DEFAULT_IGNORE_DIRS,
  "build",
  ".next",
  "graphify-out",
  "test-results",
  "playwright-report",
]);

/**
 * Test files that legitimately run outside `turbo test`. Each entry needs a
 * reason naming the thing that *does* run it — an allowlist entry without a
 * runner is just an orphan with paperwork.
 */
export const ALLOWLIST = [];

/**
 * Collect test files under a directory, relative to `from`.
 *
 * Delegates the walk to the shared hardened walker rather than hand-rolling a
 * fourth one — that is what skips nested git worktrees, without which a
 * checkout carrying agent worktrees reports every worktree's tests as orphans
 * and fails `repo-audit` on the developer's own machine.
 *
 * @param {string} dir - Absolute directory to walk.
 * @param {string} from - Absolute path that results are made relative to.
 * @param {Set<string>} [ignoreDirs]
 * @returns {string[]} POSIX-style relative paths, sorted.
 */
export function collectTestFiles(dir, from, ignoreDirs = IGNORE_DIRS) {
  return walkFiles(dir, { ignoreDirs, match: (name) => TEST_FILE_RE.test(name) })
    .map((file) => relative(from, file).split(sep).join("/"))
    .sort();
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
