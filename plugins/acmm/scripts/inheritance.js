/**
 * Inheritance-aware criterion evaluation for monorepo/sub-project ACMM scoring.
 *
 * When a project has `acmm.inherit: true` in package.json, criteria checks first
 * look locally, then (if not found and path is in globalPaths) at the repo root.
 *
 * Exports:
 *   evaluateWithInheritance(allCriteria, projectPath, repoRoot, acmmConfig)
 *     → { detectedIds: Set, criterionVerdicts: Map, origins: Map }
 */

import { evaluate } from "./evaluate.js";

/**
 * Determine whether a criterion's path should be inherited from the repo root.
 *
 * @param {{ detection: { pattern: any } }} criterion
 * @param {{ inherit: boolean, globalPaths: string[], localOnly: string[] }} config
 * @returns {boolean}
 */
function isInheritablePath(criterion, config) {
  if (!config.inherit) return false;
  if (!config.globalPaths || config.globalPaths.length === 0) return false;

  const patterns = Array.isArray(criterion.detection.pattern)
    ? criterion.detection.pattern
    : [criterion.detection.pattern];

  for (const pattern of patterns) {
    const path = typeof pattern === "string" ? pattern : (pattern.file ?? "");
    if (!path) continue;

    // Check if this path (or a parent dir) is in globalPaths
    for (const gp of config.globalPaths) {
      // Normalize trailing slashes
      const gpNorm = gp.endsWith("/") ? gp : gp + "/";
      const pathNorm = path.endsWith("/") ? path : path + "/";

      // Exact match or path starts with global path prefix
      if (path === gp || pathNorm.startsWith(gpNorm)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a criterion is in the localOnly list and must be detected locally.
 *
 * @param {{ detection: { pattern: any } }} criterion
 * @param {{ localOnly: string[] }} config
 * @returns {boolean}
 */
function isLocalOnly(criterion, config) {
  if (!config.localOnly || config.localOnly.length === 0) return false;

  const patterns = Array.isArray(criterion.detection.pattern)
    ? criterion.detection.pattern
    : [criterion.detection.pattern];

  for (const pattern of patterns) {
    const path = typeof pattern === "string" ? pattern : (pattern.file ?? "");
    if (!path) continue;

    for (const local of config.localOnly) {
      if (path === local || path.startsWith(local.replace(/\/$/, "") + "/")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Evaluate all criteria with inheritance support.
 *
 * @param {Array} allCriteria - All 85+ ACMM criteria
 * @param {string} projectPath - Path to project being audited
 * @param {string} repoRoot - Path to repo root
 * @param {{ inherit: boolean, globalPaths: string[], localOnly: string[] }} acmmConfig
 * @returns {{ detectedIds: Set<string>, criterionVerdicts: Map<string, Object>, origins: Map<string, string> }}
 */
export function evaluateWithInheritance(allCriteria, projectPath, repoRoot, acmmConfig) {
  const detectedIds = new Set();
  const criterionVerdicts = new Map();
  const origins = new Map();

  for (const criterion of allCriteria) {
    // Check locally first
    const localVerdict = evaluate(criterion, projectPath);
    const localPassed = localVerdict.verdict === "pass" || localVerdict.verdict === "unverifiable";

    if (localPassed) {
      // Found locally — use that
      detectedIds.add(criterion.id);
      criterionVerdicts.set(criterion.id, localVerdict);
      origins.set(criterion.id, "local");
    } else if (!isLocalOnly(criterion, acmmConfig) && isInheritablePath(criterion, acmmConfig)) {
      // Not found locally, but inheritable and path is global — check root
      const rootVerdict = evaluate(criterion, repoRoot);
      const rootPassed = rootVerdict.verdict === "pass" || rootVerdict.verdict === "unverifiable";

      if (rootPassed) {
        detectedIds.add(criterion.id);
        criterionVerdicts.set(criterion.id, rootVerdict);
        origins.set(criterion.id, "inherited");
      } else {
        // Not found anywhere
        criterionVerdicts.set(criterion.id, rootVerdict);
        origins.set(criterion.id, "not-found");
      }
    } else {
      // Not found and either not inheritable or is localOnly
      criterionVerdicts.set(criterion.id, localVerdict);
      origins.set(criterion.id, "not-found");
    }
  }

  return { detectedIds, criterionVerdicts, origins };
}
