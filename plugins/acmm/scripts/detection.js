/**
 * Detection engine for ACMM criteria.
 *
 * Resolves a Criterion's `detection: { type, pattern }` against the
 * filesystem rooted at `cwd`. Returns true iff at least one matching
 * file or directory exists.
 *
 * Detection types in the canonical sources (as of port date):
 *   - `path`   — single file or directory path; trailing `/` matches a dir
 *   - `any-of` — array of paths; ANY one existing satisfies the criterion
 *   - `active` — file exists AND a recent successful workflow run is found (via `gh run list`)
 *   - `grep`   — file exists AND contains a specific regex pattern
 *   - `glob`   — reserved; not used in current canonical data
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

function existsAt(cwd, pattern) {
  const isDir = pattern.endsWith("/");
  const target = isDir ? pattern.slice(0, -1) : pattern;
  const abs = join(cwd, target);
  if (!existsSync(abs)) return false;
  if (isDir) {
    try {
      return statSync(abs).isDirectory();
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Check whether a GitHub Actions workflow has run successfully within a
 * time window, using the `gh` CLI.
 *
 * @param {string} cwd        — repo root
 * @param {string} workflowFile — workflow filename (e.g. 'auto-issue.yml')
 * @param {number} maxAgeDays  — max age in days for the most recent run
 * @param {{ execFileSyncFn?: Function }} [opts] — injectable for testing
 * @returns {{ active: boolean | null, degraded?: boolean, conclusion?: string, reason: string }}
 */
export function isWorkflowActive(cwd, workflowFile, maxAgeDays, opts = {}) {
  const fn = opts.execFileSyncFn ?? execFileSync;
  try {
    const result = fn(
      "gh",
      [
        "run",
        "list",
        `--workflow=${workflowFile}`,
        "--status=completed",
        "--limit=5",
        "--json",
        "conclusion,updatedAt",
      ],
      { cwd, encoding: "utf-8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }
    );
    const runs = JSON.parse(result);
    if (runs.length === 0) {
      return { active: false, reason: "no completed runs" };
    }
    // Only count successful runs — failed/skipped/cancelled runs don't prove the workflow works
    const successfulRuns = runs.filter((r) => r.conclusion === "success");
    if (successfulRuns.length === 0) {
      return {
        active: false,
        conclusion: runs[0].conclusion,
        reason: `no successful runs (last was ${runs[0].conclusion})`,
      };
    }
    const lastSuccess = new Date(successfulRuns[0].updatedAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    if (lastSuccess < cutoff) {
      return {
        active: false,
        reason: `last success ${successfulRuns[0].updatedAt} exceeds ${maxAgeDays}d window`,
      };
    }
    return { active: true, conclusion: "success", reason: "recent successful run found" };
  } catch {
    return { active: null, degraded: true, reason: "gh CLI unavailable or error" };
  }
}

/**
 * Run detection for a single criterion.
 *
 * @param {string} cwd
 * @param {{ detection: { type: 'path' | 'glob' | 'any-of' | 'active', pattern: string | string[], maxAgeDays?: number }}} criterion
 * @param {{ execFileSyncFn?: Function }} [opts]
 * @returns {boolean}
 */
export function detect(cwd, criterion, opts = {}) {
  const { type, pattern, maxAgeDays = 30 } = criterion.detection;

  // Delegate `github:` prefixed patterns to the criterion's check function
  if (
    type === "active" &&
    typeof pattern === "string" &&
    pattern.startsWith("github:") &&
    typeof criterion.check === "function"
  ) {
    const result = criterion.check(cwd, opts);
    return result.passed;
  }

  if (type === "path") {
    if (Array.isArray(pattern)) return pattern.some((p) => existsAt(cwd, p));
    return existsAt(cwd, pattern);
  }
  if (type === "any-of") {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some((p) => existsAt(cwd, p));
  }
  if (type === "active") {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const filePresent = patterns.some((p) => existsAt(cwd, p));
    if (!filePresent) return false;
    // Check first matching file for workflow activity
    const workflowFile = patterns.find((p) => existsAt(cwd, p));
    const result = isWorkflowActive(cwd, workflowFile, maxAgeDays, opts);
    if (result.degraded) return false; // gh unavailable → unverifiable, not a pass
    return result.active;
  }
  if (type === "grep") {
    const { file, contains } = pattern;
    const abs = join(cwd, file);
    if (!existsSync(abs)) return false;
    try {
      const content = readFileSync(abs, "utf-8");
      const regex = new RegExp(contains);
      return regex.test(content);
    } catch {
      return false;
    }
  }
  if (type === "glob") {
    throw new Error(`detection.type='glob' is not implemented (no canonical criterion uses it).`);
  }
  throw new Error(`unknown detection.type: ${type}`);
}

/**
 * Run detection for all criteria.
 *
 * Returns both a Set of detected IDs (backward-compatible) and a Map
 * with per-criterion metadata for `active` detections, distinguishing
 * "file exists and operating" from "file exists but inactive" and
 * "file exists, gh degraded".
 *
 * @param {string} cwd
 * @param {Array<{ id: string, detection: any }>} criteria
 * @param {{ execFileSyncFn?: Function }} [opts]
 * @returns {{ detected: Set<string>, meta: Map<string, { status: 'active' | 'inactive' | 'degraded' | 'missing', reason?: string }> }}
 */
export function detectAll(cwd, criteria, opts = {}) {
  const detected = new Set();
  const meta = new Map();
  for (const c of criteria) {
    if (c.detection.type === "active") {
      const { maxAgeDays = 7 } = c.detection;
      const patterns = Array.isArray(c.detection.pattern)
        ? c.detection.pattern
        : [c.detection.pattern];

      // Handle `github:` prefixed patterns via the criterion's check function
      const isGithubPattern =
        patterns.length === 1 &&
        typeof patterns[0] === "string" &&
        patterns[0].startsWith("github:") &&
        typeof c.check === "function";
      if (isGithubPattern) {
        const checkResult = c.check(cwd, opts);
        if (checkResult.passed) {
          detected.add(c.id);
          meta.set(c.id, { status: "active", reason: checkResult.evidence });
        } else {
          meta.set(c.id, { status: "inactive", reason: checkResult.evidence });
        }
        continue;
      }

      const filePresent = patterns.some((p) => existsAt(cwd, p));
      if (!filePresent) {
        meta.set(c.id, { status: "missing", reason: "file not found" });
        continue;
      }
      const workflowFile = patterns.find((p) => existsAt(cwd, p));
      const result = isWorkflowActive(cwd, workflowFile, maxAgeDays, opts);
      if (result.degraded) {
        // gh unavailable → unverifiable: exclude from detected set (not a pass)
        meta.set(c.id, { status: "degraded", reason: result.reason });
      } else if (result.active) {
        detected.add(c.id);
        meta.set(c.id, { status: "active", reason: result.reason });
      } else {
        meta.set(c.id, { status: "inactive", reason: result.reason });
      }
    } else {
      if (detect(cwd, c, opts)) detected.add(c.id);
    }
  }
  return { detected, meta };
}
