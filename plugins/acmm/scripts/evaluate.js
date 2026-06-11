/**
 * Single verdict seam for ACMM criterion evaluation.
 *
 * evaluate(criterion, cwd, opts) -> { verdict, evidence }
 *
 * Verdicts:
 *   'pass'          — criterion detected (and substance passes, if a substance checker exists)
 *   'hollow'        — criterion detected but substance check failed
 *   'stale'         — active type: file present but no recent successful workflow run
 *   'unverifiable'  — active type: file present but gh CLI unavailable/errored
 *   'not-found'     — file(s) not found / pattern not matched
 *
 * Behavior-preserving mapping vs prior detection logic:
 *   - path/any-of/grep detected               → pass (or hollow if substance fails)
 *   - active detected + recent run            → pass
 *   - active: file present + gh degraded      → unverifiable  (prior: detect() returned true)
 *   - active: file present + no recent run    → stale         (prior: detect() returned false)
 *   - any type: file(s) not found             → not-found
 *
 * NOTE: Level math in audit.js treats 'pass' and 'unverifiable' as "counted" (matching
 * prior graceful-degradation behavior). 'stale', 'hollow', and 'not-found' are not counted.
 * This keeps before/after behavior identical until follow-up issues #2022/#2023/#2024.
 */

import { existsSync, statSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { isWorkflowActive } from "./detection.js";
import { substanceCheckers } from "./substance.js";

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

function formatPattern(p) {
  if (typeof p === "string") return p;
  return p.file ? `${p.file} (contains: ${p.contains})` : JSON.stringify(p);
}

/**
 * Run the substance check for a criterion, if one is registered.
 *
 * @param {{ id: string, detection: { pattern: any } }} criterion
 * @param {string} cwd
 * @returns {{ passed: boolean | null, evidence: string | null }}
 */
function runSubstance(criterion, cwd) {
  const checker = substanceCheckers[criterion.id];
  if (!checker) return { passed: null, evidence: null };

  const raw = criterion.detection.pattern;
  const patterns = Array.isArray(raw) ? raw : [raw];
  const resolvedPaths = patterns
    .map((p) => {
      const rel = typeof p === "string" ? p : (p.file ?? "");
      return resolve(cwd, rel);
    })
    .filter((p) => existsSync(p));

  if (resolvedPaths.length === 0) {
    return { passed: false, evidence: "no files found for substance check" };
  }

  const filePaths = [];
  for (const p of resolvedPaths) {
    try {
      const s = statSync(p);
      if (s.isDirectory()) {
        try {
          for (const entry of readdirSync(p, { recursive: true })) {
            const full = join(p, String(entry));
            try {
              if (statSync(full).isFile()) filePaths.push(full);
            } catch {
              /* skip */
            }
          }
        } catch {
          /* skip unreadable dirs */
        }
      } else {
        filePaths.push(p);
      }
    } catch {
      /* skip */
    }
  }

  if (filePaths.length === 0) {
    return { passed: false, evidence: "no files found for substance check" };
  }

  const result = checker(filePaths, cwd);
  return { passed: result.passed, evidence: result.evidence };
}

/**
 * Evaluate a single criterion and return a structured verdict.
 *
 * @param {{ id: string, detection: { type: string, pattern: any, maxAgeDays?: number }, check?: Function }} criterion
 * @param {string} cwd
 * @param {{ execFileSyncFn?: Function }} [opts]
 * @returns {{
 *   verdict: 'pass' | 'hollow' | 'stale' | 'unverifiable' | 'not-found',
 *   evidence: string,
 *   substanceEvidence?: string | null
 * }}
 * For 'hollow' verdicts, `evidence` is the detection evidence (file found) and
 * `substanceEvidence` is the substance failure reason.
 */
export function evaluate(criterion, cwd, opts = {}) {
  const { type, pattern, maxAgeDays = 30 } = criterion.detection;
  const patterns = Array.isArray(pattern) ? pattern : [pattern];

  // ── Handle `github:` prefixed active patterns via criterion.check() ─────
  const isGithubPattern =
    type === "active" &&
    patterns.length === 1 &&
    typeof patterns[0] === "string" &&
    patterns[0].startsWith("github:") &&
    typeof criterion.check === "function";

  if (isGithubPattern) {
    const checkResult = criterion.check(cwd, opts);
    if (checkResult.passed) {
      return { verdict: "pass", evidence: checkResult.evidence ?? "github check passed" };
    }
    return { verdict: "not-found", evidence: checkResult.evidence ?? "github check failed" };
  }

  // ── path / any-of ────────────────────────────────────────────────────────
  if (type === "path" || type === "any-of") {
    const matched = patterns.find((p) => existsAt(cwd, p));
    if (!matched) {
      return {
        verdict: "not-found",
        evidence: `none of: ${patterns.map(formatPattern).join(", ")}`,
      };
    }
    const evidence = `detected at: ${formatPattern(matched)}`;
    const sub = runSubstance(criterion, cwd);
    if (sub.passed === false) {
      return { verdict: "hollow", evidence, substanceEvidence: sub.evidence };
    }
    return { verdict: "pass", evidence };
  }

  // ── grep ────────────────────────────────────────────────────────────────
  if (type === "grep") {
    const { file, contains } = pattern;
    const abs = join(cwd, file);
    if (!existsSync(abs)) {
      return { verdict: "not-found", evidence: `file not found: ${file}` };
    }
    try {
      const content = readFileSync(abs, "utf-8");
      const regex = new RegExp(contains);
      if (!regex.test(content)) {
        return { verdict: "not-found", evidence: `${file} does not contain: ${contains}` };
      }
    } catch {
      return { verdict: "not-found", evidence: `could not read ${file}` };
    }
    const evidence = `${file} contains: ${contains}`;
    const sub = runSubstance(criterion, cwd);
    if (sub.passed === false) {
      return { verdict: "hollow", evidence, substanceEvidence: sub.evidence };
    }
    return { verdict: "pass", evidence };
  }

  // ── active ───────────────────────────────────────────────────────────────
  if (type === "active") {
    const filePresent = patterns.some((p) => existsAt(cwd, p));
    if (!filePresent) {
      return {
        verdict: "not-found",
        evidence: `file not found: ${patterns.map(formatPattern).join(", ")}`,
      };
    }
    const workflowFile = patterns.find((p) => existsAt(cwd, p));
    const result = isWorkflowActive(cwd, workflowFile, maxAgeDays, opts);
    if (result.degraded) {
      return {
        verdict: "unverifiable",
        evidence: result.reason ?? "gh CLI unavailable or error",
      };
    }
    if (!result.active) {
      return { verdict: "stale", evidence: result.reason ?? "no recent successful run" };
    }
    const evidence = `${workflowFile}: ${result.reason ?? "recent successful run"}`;
    const sub = runSubstance(criterion, cwd);
    if (sub.passed === false) {
      return { verdict: "hollow", evidence, substanceEvidence: sub.evidence };
    }
    return { verdict: "pass", evidence };
  }

  if (type === "glob") {
    throw new Error(`detection.type='glob' is not implemented (no canonical criterion uses it).`);
  }
  throw new Error(`unknown detection.type: ${type}`);
}

/**
 * Whether a verdict counts as "detected" for level-math purposes.
 *
 * Behavior-preserving mapping:
 *   'pass'          → true  (detected, substance passed)
 *   'hollow'        → true  (detected, substance failed — but detection still counts for level math,
 *                            matching prior behavior where detect() returned true regardless of substance)
 *   'unverifiable'  → true  (active type, gh degraded — matches prior graceful-degradation)
 *   'stale'         → false (active type, no recent run)
 *   'not-found'     → false (file/pattern not found)
 *
 * NOTE: 'hollow' counting here is the behavior-preserving choice. Follow-up issues
 * #2022/#2023/#2024 will make hollow verdicts consequential (i.e. not count).
 *
 * @param {'pass'|'hollow'|'stale'|'unverifiable'|'not-found'} verdict
 * @returns {boolean}
 */
export function verdictCounts(verdict) {
  return verdict === "pass" || verdict === "hollow" || verdict === "unverifiable";
}
