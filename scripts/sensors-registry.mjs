/**
 * Sensors registry — single source of truth for each sensor's category,
 * issue labels, severity, and verify function.
 *
 * Consumers:
 *   - sensor-correlator derives CATEGORY_MAP / LABEL_MAP from this
 *   - verify-fixes resolves verifiers via getSensorByLabel()
 *   - producers (cors-audit, etc.) can call getLabelsForSensor()
 */

/**
 * @typedef {{ verified: boolean; reason: string; confidence?: string }} VerifyResult
 * @typedef {{
 *   id: string;
 *   category: string;
 *   issueLabels: string[];
 *   severity: string;
 *   metricKeys?: Array<{ key: string; category?: string }>;
 *   verifyFix: (title: string, body: string) => VerifyResult;
 * }} SensorEntry
 */

/**
 * Registry of all known sensors.
 *
 * metricKeys entries use the sensor's default category unless an override is provided.
 * This matches the original CATEGORY_MAP where sentry:timeout_rate sits in "performance"
 * and ci:duration also sits in "performance" even though the sensor default is "availability".
 *
 * @type {SensorEntry[]}
 */
export const SENSORS = [
  {
    id: "lighthouse",
    category: "performance",
    issueLabels: ["audit"],
    severity: "high",
    metricKeys: [
      { key: "lighthouse:performance" },
      { key: "lighthouse:speed-index" },
      { key: "lighthouse:a11y", category: "quality" },
      { key: "lighthouse:best-practices", category: "quality" },
      { key: "lighthouse:seo", category: "quality" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "Lighthouse verification deferred to verify-fixes audit verifier",
      confidence: "skip",
    }),
  },
  {
    id: "ci",
    category: "availability",
    issueLabels: ["ci-fix"],
    severity: "high",
    metricKeys: [
      { key: "ci:duration", category: "performance" },
      { key: "ci:pass_rate" },
      { key: "ci:failures" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "CI verification deferred to verify-fixes ci verifier",
      confidence: "skip",
    }),
  },
  {
    id: "sentry",
    category: "availability",
    issueLabels: ["sentry"],
    severity: "high",
    metricKeys: [
      { key: "sentry:timeout_rate", category: "performance" },
      { key: "sentry:error_rate" },
      { key: "sentry:error_count" },
    ],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "Sentry verification not yet available — requires MCP authentication (#983)",
      confidence: "skip",
    }),
  },
  {
    id: "acmm",
    category: "quality",
    issueLabels: ["acmm"],
    severity: "medium",
    metricKeys: [{ key: "acmm:level" }, { key: "acmm:criteria_count" }],
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "ACMM verification deferred to verify-fixes acmm verifier",
      confidence: "skip",
    }),
  },
  {
    id: "cors",
    category: "security",
    issueLabels: ["security", "audit"],
    severity: "critical",
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "CORS verification: re-run cors-audit.mjs to confirm no new findings",
      confidence: "low",
    }),
  },
  {
    id: "bug",
    category: "quality",
    issueLabels: ["bug"],
    severity: "medium",
    verifyFix: (_title, _body) => ({
      verified: false,
      reason: "Bug verification deferred to verify-fixes bug verifier",
      confidence: "skip",
    }),
  },
];

/**
 * Returns the first sensor entry whose issueLabels includes the given label,
 * or null if none matches.
 *
 * @param {string} label
 * @returns {SensorEntry | null}
 */
export function getSensorByLabel(label) {
  return SENSORS.find((s) => s.issueLabels.includes(label)) ?? null;
}

/**
 * Returns a deduplicated list of all issue labels across all sensors.
 *
 * @returns {string[]}
 */
export function getAllLabels() {
  return [...new Set(SENSORS.flatMap((s) => s.issueLabels))];
}

/**
 * Returns the issue labels for a specific sensor id.
 *
 * @param {string} sensorId
 * @returns {string[]}
 */
export function getLabelsForSensor(sensorId) {
  const sensor = SENSORS.find((s) => s.id === sensorId);
  return sensor?.issueLabels ?? [];
}

/**
 * Builds the CATEGORY_MAP format expected by sensor-correlator:
 * { category → string[] of "sensorId:metric" keys }
 *
 * Metric keys use their per-entry category override if present,
 * otherwise fall back to the sensor's default category.
 *
 * @returns {Record<string, string[]>}
 */
export function buildCategoryMap() {
  /** @type {Record<string, string[]>} */
  const map = {};
  for (const sensor of SENSORS) {
    if (!sensor.metricKeys) continue;
    for (const entry of sensor.metricKeys) {
      const category = entry.category ?? sensor.category;
      map[category] = [...(map[category] ?? []), entry.key];
    }
  }
  return map;
}

/**
 * Builds the LABEL_MAP format expected by sensor-correlator:
 * { sensorId → primary issue label (first in issueLabels array) }
 *
 * @returns {Record<string, string>}
 */
export function buildLabelMap() {
  /** @type {Record<string, string>} */
  const map = {};
  for (const sensor of SENSORS) {
    map[sensor.id] = sensor.issueLabels[0];
  }
  return map;
}
