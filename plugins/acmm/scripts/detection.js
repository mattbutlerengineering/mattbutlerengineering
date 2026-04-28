/**
 * Detection engine for ACMM criteria.
 */

import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

function existsAt(cwd, pattern) {
  const isDir = pattern.endsWith('/');
  const target = isDir ? pattern.slice(0, -1) : pattern;
  const abs = join(cwd, target);
  if (!existsSync(abs)) return { detected: false };
  if (isDir) {
    try {
      const isDirectory = statSync(abs).isDirectory();
      return { detected: isDirectory, evidence: isDirectory ? abs : undefined };
    } catch {
      return { detected: false };
    }
  }
  return { detected: true, evidence: abs };
}

/**
 * Run detection for a single criterion.
 *
 * @param {string} cwd
 * @param {{ id: string, detection: { type: 'path' | 'glob' | 'any-of' | 'behavior', pattern: string | string[] }}} criterion
 * @returns {{ detected: boolean, evidence?: string }}
 */
export function detect(cwd, criterion) {
  const { type, pattern } = criterion.detection;
  if (type === 'path') {
    if (Array.isArray(pattern)) {
      for (const p of pattern) {
        const res = existsAt(cwd, p);
        if (res.detected) return res;
      }
      return { detected: false };
    }
    return existsAt(cwd, pattern);
  }
  if (type === 'any-of') {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    for (const p of patterns) {
      const res = existsAt(cwd, p);
      if (res.detected) return res;
    }
    return { detected: false };
  }
  if (type === 'behavior') {
    try {
      const output = execSync(pattern, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
      return { detected: true, evidence: output.trim() || '(exit code 0)' };
    } catch {
      return { detected: false };
    }
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
 * @returns {Map<string, string>} map of detected criterion IDs to evidence
 */
export function detectAll(cwd, criteria) {
  const detected = new Map();
  for (const c of criteria) {
    const res = detect(cwd, c);
    if (res.detected) {
      detected.set(c.id, res.evidence || '(detected)');
    }
  }
  return detected;
}
