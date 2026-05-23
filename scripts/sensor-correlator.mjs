/**
 * Sensor correlator for the learning loop.
 *
 * Groups related regression signals into single root-cause issues,
 * preventing duplicate issues across sensors.
 *
 * Called by the learning-loop after sensor collection and before issue creation.
 * The output replaces the raw `regressions[]` as input to the issue creation step.
 */

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const MAX_GROUPS = 3;

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const CATEGORY_MAP = {
  performance: [
    "lighthouse:performance",
    "lighthouse:speed-index",
    "sentry:timeout_rate",
    "ci:duration",
  ],
  availability: ["sentry:error_rate", "sentry:error_count", "ci:pass_rate", "ci:failures"],
  quality: ["acmm:level", "acmm:criteria_count", "lighthouse:a11y", "lighthouse:best-practices"],
};

const LABEL_MAP = {
  lighthouse: "audit",
  ci: "ci-fix",
  sentry: "sentry",
  acmm: "acmm",
};

function classifySignal(signal) {
  const key = `${signal.sensor}:${signal.metric}`;
  for (const [category, keys] of Object.entries(CATEGORY_MAP)) {
    if (keys.includes(key)) return category;
  }
  if (signal.sensor === "lighthouse") return "performance";
  if (signal.sensor === "sentry") return "availability";
  if (signal.sensor === "ci") return "availability";
  if (signal.sensor === "acmm") return "quality";
  return "quality";
}

function getTimestamp(signal) {
  if (signal.timestamp) return new Date(signal.timestamp).getTime();
  return Date.now();
}

function withinTimeWindow(tsA, tsB) {
  return Math.abs(tsA - tsB) <= TWENTY_FOUR_HOURS_MS;
}

function isDuplicate(signal, openIssues) {
  const sensorLower = signal.sensor.toLowerCase();
  const metricLower = signal.metric.toLowerCase();
  return openIssues.some((issue) => {
    const title = (issue.title ?? "").toLowerCase();
    return title.includes(sensorLower) && title.includes(metricLower);
  });
}

function highestSeverity(signals) {
  let best = "low";
  for (const s of signals) {
    const sev = s.severity ?? "low";
    if ((SEVERITY_ORDER[sev] ?? 3) < (SEVERITY_ORDER[best] ?? 3)) {
      best = sev;
    }
  }
  return best;
}

function primaryLabel(signals) {
  const counts = {};
  for (const s of signals) {
    const label = LABEL_MAP[s.sensor] ?? "bug";
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "bug";
}

function buildRootCause(signals) {
  const sensors = [...new Set(signals.map((s) => s.sensor))];
  const metrics = [...new Set(signals.map((s) => s.metric))];
  if (sensors.length === 1) {
    return `${sensors[0]} ${metrics.join(" + ")} regression`;
  }
  return `cross-sensor regression: ${sensors.join(" + ")} (${metrics.join(", ")})`;
}

/**
 * @param {Object} sensorReport - The sensor-report.json contents (has `regressions[]` array)
 * @param {Array} openIssues - Currently open GitHub issues (from `gh issue list`)
 * @returns {Array<{rootCause: string, signals: Array, severity: string, suggestedLabel: string}>}
 */
export function correlate(sensorReport, openIssues) {
  const regressions = sensorReport?.regressions;
  if (!regressions || regressions.length === 0) return [];

  const deduplicated = regressions.filter((s) => !isDuplicate(s, openIssues));
  if (deduplicated.length === 0) return [];

  const classified = deduplicated.map((s) => ({
    signal: s,
    category: classifySignal(s),
    ts: getTimestamp(s),
  }));

  const groups = [];
  const used = new Set();

  for (let i = 0; i < classified.length; i++) {
    if (used.has(i)) continue;

    const group = [classified[i]];
    used.add(i);

    for (let j = i + 1; j < classified.length; j++) {
      if (used.has(j)) continue;
      if (
        classified[j].category === classified[i].category &&
        withinTimeWindow(classified[j].ts, classified[i].ts)
      ) {
        group.push(classified[j]);
        used.add(j);
      }
    }

    const signals = group.map((g) => g.signal);
    groups.push({
      rootCause: buildRootCause(signals),
      signals,
      severity: highestSeverity(signals),
      suggestedLabel: primaryLabel(signals),
    });
  }

  groups.sort((a, b) => {
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;
    return b.signals.length - a.signals.length;
  });

  return groups.slice(0, MAX_GROUPS);
}
