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
 *   - `glob`   — reserved; not used in current canonical data
 *   - `active` — file exists AND a recent successful workflow run is found
 */

import { existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { execFileSync as _execFileSync } from 'node:child_process';

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
 * Check if a workflow had a successful run within maxAgeDays.
 * Returns true on success, false when run is too old or absent.
 * Falls back to true (file-presence only) when gh CLI is unavailable.
 *
 * @param {string} workflowFile - filename of the workflow (e.g. 'auto-issue.yml')
 * @param {number} maxAgeDays
 * @param {Function} execFileSyncFn - injectable for testing
 * @returns {{ active: boolean, fallback: boolean }}
 */
function checkWorkflowActivity(workflowFile, maxAgeDays, execFileSyncFn) {
  const fn = execFileSyncFn ?? _execFileSync;
  try {
    const out = fn(
      'gh',
      ['run', 'list', `--workflow=${workflowFile}`, '--status=success', '--limit=1', '--json', 'updatedAt'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const runs = JSON.parse(out);
    if (!Array.isArray(runs) || runs.length === 0) return { active: false, fallback: false };
    const updatedAt = new Date(runs[0].updatedAt);
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    return { active: updatedAt >= cutoff, fallback: false };
  } catch {
    process.stderr.write(
      `[acmm] gh CLI unavailable or errored for workflow "${workflowFile}"; falling back to file-presence only\n`,
    );
    return { active: true, fallback: true };
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
  if (type === 'path') {
    if (Array.isArray(pattern)) return pattern.some((p) => existsAt(cwd, p));
    return existsAt(cwd, pattern);
  }
  if (type === 'any-of') {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some((p) => existsAt(cwd, p));
  }
  if (type === 'active') {
    const filePath = Array.isArray(pattern) ? pattern[0] : pattern;
    if (!existsAt(cwd, filePath)) return false;
    const workflowFile = basename(filePath);
    const { active } = checkWorkflowActivity(workflowFile, maxAgeDays, opts.execFileSyncFn);
    return active;
  }
  if (type === 'glob') {
    throw new Error(`detection.type='glob' is not implemented (no canonical criterion uses it).`);
  }
  throw new Error(`unknown detection.type: ${type}`);
}

/**
 * Run detection for all criteria.
 *
 * @param {string} cwd
 * @param {Array<{ id: string, detection: any }>} criteria
 * @param {{ execFileSyncFn?: Function }} [opts]
 * @returns {Set<string>} set of detected criterion IDs
 */
export function detectAll(cwd, criteria, opts = {}) {
  const detected = new Set();
  for (const c of criteria) {
    if (detect(cwd, c, opts)) detected.add(c.id);
  }
  return detected;
}
