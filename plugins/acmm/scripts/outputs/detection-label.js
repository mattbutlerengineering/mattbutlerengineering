/**
 * Human-readable detection label for `type: "check"` criteria.
 *
 * Those criteria detect via their own `check()` function; `detection.pattern`
 * is only a documentation pointer, so printing it as "any of <pattern>" misleads.
 */

/**
 * @param {{ detection: { type: string }, check?: Function }} criterion
 * @returns {boolean}
 */
export function isCheckCriterion(criterion) {
  return criterion.detection.type === "check";
}

/**
 * @param {{ check?: Function }} criterion
 * @returns {string}
 */
export function checkDetectionLabel(criterion) {
  const name = typeof criterion.check === "function" ? criterion.check.name : "";
  return name ? `check() — ${name}` : "check()";
}
