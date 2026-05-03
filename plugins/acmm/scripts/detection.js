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
 *   - `active` — file exists AND workflow ran recently (via `gh run list`)
 *   - `glob`   — reserved; not used in current canonical data
 */

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

function existsAt(cwd, pattern) {
  const isDir = pattern.endsWith('/');
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
 * @returns {{ active: boolean | null, degraded?: boolean, conclusion?: string, reason: string }}
 */
export function isWorkflowActive(cwd, workflowFile, maxAgeDays) {
  try {
    const result = execFileSync(
      'gh',
      ['run', 'list', `--workflow=${workflowFile}`, '--status=completed', '--limit=1', '--json', 'conclusion,updatedAt'],
      { cwd, encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const runs = JSON.parse(result);
    if (runs.length === 0) {
      return { active: false, reason: 'no completed runs' };
    }
    const lastRun = new Date(runs[0].updatedAt);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxAgeDays);
    if (lastRun < cutoff) {
      return { active: false, reason: `last run ${runs[0].updatedAt} exceeds ${maxAgeDays}d window` };
    }
    return { active: true, conclusion: runs[0].conclusion, reason: 'recent run found' };
  } catch {
    return { active: null, degraded: true, reason: 'gh CLI unavailable or error' };
  }
}

/**
 * Run detection for a single criterion.
 *
 * @param {string} cwd
 * @param {{ detection: { type: 'path' | 'glob' | 'any-of' | 'active', pattern: string | string[], maxAgeDays?: number }}} criterion
 * @returns {boolean}
 */
export function detect(cwd, criterion) {
  const { type, pattern } = criterion.detection;
  if (type === 'path') {
    if (Array.isArray(pattern)) return pattern.some((p) => existsAt(cwd, p));
    return existsAt(cwd, pattern);
  }
  if (type === 'any-of') {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some((p) => existsAt(cwd, p));
  }
  if (type === 'active') {
    const { maxAgeDays = 7 } = criterion.detection;
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const filePresent = patterns.some((p) => existsAt(cwd, p));
    if (!filePresent) return false;
    // Check first matching file for workflow activity
    const workflowFile = patterns.find((p) => existsAt(cwd, p));
    const result = isWorkflowActive(cwd, workflowFile, maxAgeDays);
    if (result.degraded) return true; // graceful degradation: file exists, gh unavailable
    return result.active;
  }
  if (type === 'glob') {
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
 * @returns {{ detected: Set<string>, meta: Map<string, { status: 'active' | 'inactive' | 'degraded' | 'missing', reason?: string }> }}
 */
export function detectAll(cwd, criteria) {
  const detected = new Set();
  const meta = new Map();
  for (const c of criteria) {
    if (c.detection.type === 'active') {
      const { maxAgeDays = 7 } = c.detection;
      const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];
      const filePresent = patterns.some((p) => existsAt(cwd, p));
      if (!filePresent) {
        meta.set(c.id, { status: 'missing', reason: 'file not found' });
        continue;
      }
      const workflowFile = patterns.find((p) => existsAt(cwd, p));
      const result = isWorkflowActive(cwd, workflowFile, maxAgeDays);
      if (result.degraded) {
        detected.add(c.id);
        meta.set(c.id, { status: 'degraded', reason: result.reason });
      } else if (result.active) {
        detected.add(c.id);
        meta.set(c.id, { status: 'active', reason: result.reason });
      } else {
        meta.set(c.id, { status: 'inactive', reason: result.reason });
      }
    } else {
      if (detect(cwd, c)) detected.add(c.id);
    }
  }
  return { detected, meta };
}
