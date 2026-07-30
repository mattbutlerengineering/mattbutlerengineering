/**
 * Build-time collector for the marketing landing "proof strip".
 *
 * The landing voice is evidence-first ("this site ships itself"), so the strip
 * must show real repo numbers rather than hand-maintained claims. This script
 * measures them at build time and writes
 * `apps/marketing/src/data/generated/repo-stats.json` (gitignored). The site
 * loader (`apps/marketing/src/data/repo-stats.ts`) prefers that file and falls
 * back to the committed `repo-stats.fallback.json` snapshot, so a build with no
 * network — or no token — still succeeds with slightly stale numbers.
 *
 * Rate-limit budget: exactly two GitHub search calls (`total_count` only, never
 * paginating PR history). Local counters come from the working tree.
 *
 * `collectRepoStats` is pure over its injected dependencies so the counting and
 * degradation logic is unit-testable without network or git.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Repository the proof strip describes. */
const REPO_SLUG = "mattbutlerengineering/mattbutlerengineering";

/** Every merged pull request, ever. */
export const TOTAL_MERGED_QUERY = `repo:${REPO_SLUG} is:pr is:merged`;

/**
 * Merged pull requests attributed to an agent.
 *
 * Head-branch prefixes cannot separate agent work from human work here: agents
 * use the same conventional-commit prefixes a human would (`fix/`, `feat/`,
 * `refactor/`), and the historical `worktree-agent-*` prefix only covers one
 * generation of the worker. `agent-authored` is the repo's own audit-trail
 * label, applied by `.github/workflows/ai-attribution.yml` from five
 * independent signals, so it is both broader and more defensible.
 */
export const AGENT_MERGED_QUERY = `${TOTAL_MERGED_QUERY} label:agent-authored`;

/** Component folders live one level under this directory. */
const RIALTO_COMPONENTS_DIR = "packages/rialto/src/components";

/** Where the generated snapshot is written (gitignored). */
const OUTPUT_PATH = "apps/marketing/src/data/generated/repo-stats.json";

/** Matches the repo's test/spec file naming conventions. */
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;

/**
 * Validate a GitHub search response at the trust boundary and return its count.
 *
 * @param {unknown} payload - Parsed JSON body from `GET /search/issues`.
 * @returns {number}
 */
export function parseSearchCount(payload) {
  const count =
    typeof payload === "object" && payload !== null
      ? /** @type {{ total_count?: unknown }} */ (payload).total_count
      : undefined;

  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
    throw new Error(`GitHub search response has no valid total_count: ${JSON.stringify(payload)}`);
  }
  return count;
}

/**
 * Count tracked files that are tests.
 *
 * @param {string[]} trackedFiles - Repo-relative paths, e.g. from `git ls-files`.
 * @returns {number}
 */
export function countTestFiles(trackedFiles) {
  return trackedFiles.filter((path) => TEST_FILE_RE.test(path)).length;
}

/**
 * @typedef {object} RepoStats
 * @property {number} agentPrsMerged
 * @property {number} totalPrsMerged
 * @property {number} rialtoComponents
 * @property {number} testFiles
 * @property {string} measuredAt
 */

/**
 * Measure the proof-strip numbers.
 *
 * Degrades as a unit: any failing source yields `{ available: false }` rather
 * than a partially-real snapshot, so the site keeps the committed fallback.
 *
 * @param {object} deps
 * @param {(query: string) => Promise<number>} deps.searchPrCount
 * @param {() => string[]} deps.listComponentDirs
 * @param {() => string[]} deps.listTrackedFiles
 * @param {() => Date} deps.now
 * @returns {Promise<{ available: true, stats: RepoStats } | { available: false, reason: string }>}
 */
export async function collectRepoStats({
  searchPrCount,
  listComponentDirs,
  listTrackedFiles,
  now,
}) {
  try {
    const totalPrsMerged = await searchPrCount(TOTAL_MERGED_QUERY);
    const agentPrsMerged = await searchPrCount(AGENT_MERGED_QUERY);

    return {
      available: true,
      stats: {
        agentPrsMerged,
        totalPrsMerged,
        rialtoComponents: listComponentDirs().length,
        testFiles: countTestFiles(listTrackedFiles()),
        measuredAt: now().toISOString(),
      },
    };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

// ── Real dependency implementations ──────────────────────────────────────

/**
 * Count search hits via `total_count` — one request, no pagination.
 *
 * The token travels in the Authorization header only; it is never placed in the
 * URL, the error message, or any log line.
 *
 * @param {string} token
 * @param {typeof fetch} [fetchImpl] - Injected in tests.
 * @returns {(query: string) => Promise<number>}
 */
export function createSearchPrCount(token, fetchImpl = fetch) {
  return async (query) => {
    const url = `https://api.github.com/search/issues?per_page=1&q=${encodeURIComponent(query)}`;
    const response = await fetchImpl(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "mbe-collect-repo-stats",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub search failed: ${response.status} ${response.statusText}`);
    }
    return parseSearchCount(await response.json());
  };
}

/** @returns {string[]} Directory names under packages/rialto/src/components. */
function listComponentDirs() {
  return readdirSync(resolve(ROOT, RIALTO_COMPONENTS_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** @returns {string[]} Every git-tracked path in the repo. */
function listTrackedFiles() {
  const stdout = execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout.split("\n").filter(Boolean);
}

// ── CLI ──────────────────────────────────────────────────────────────────

/**
 * Thin CLI wrapper. Always exits 0: a missing token or an unreachable GitHub
 * must degrade to the committed fallback, never fail the site build.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<void>}
 */
async function main(env) {
  // Token comes from the environment only — never logged, never persisted.
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) {
    process.stdout.write(
      "collect-repo-stats: no GITHUB_TOKEN/GH_TOKEN — keeping committed fallback snapshot\n"
    );
    return;
  }

  const result = await collectRepoStats({
    searchPrCount: createSearchPrCount(token),
    listComponentDirs,
    listTrackedFiles,
    now: () => new Date(),
  });

  if (!result.available) {
    process.stdout.write(
      `collect-repo-stats: unavailable (${result.reason}) — keeping committed fallback snapshot\n`
    );
    return;
  }

  const outFile = resolve(ROOT, OUTPUT_PATH);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(result.stats, null, 2)}\n`);
  process.stdout.write(`collect-repo-stats: wrote ${OUTPUT_PATH}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.env);
}
