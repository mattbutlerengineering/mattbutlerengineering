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
 */

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
 * Run detection for a single criterion.
 *
 * @param {string} cwd
 * @param {{ detection: { type: 'path' | 'glob' | 'any-of', pattern: string | string[] }}} criterion
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
 * @returns {Set<string>} set of detected criterion IDs
 */
export function detectAll(cwd, criteria) {
  const detected = new Set();
  for (const c of criteria) {
    if (detect(cwd, c)) detected.add(c.id);
  }
  return detected;
}
