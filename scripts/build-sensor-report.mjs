/**
 * Pure report-assembly logic for the daily sensor report.
 *
 * Iterates `getReportSensors()` (the sensors-registry entries that carry a
 * `collect` function) to assemble the report shape, detect regressions, and
 * render display lines. No process.exit, no file IO, no network calls —
 * the CLI shim (sensor-report.mjs) is responsible for collecting sensor data
 * and for all IO/exit.
 */

import { getReportSensors } from "./sensors-registry.mjs";

/**
 * Assemble the sensor report from already-collected sensor data.
 *
 * @param {Record<string, object>} sensors - Collected sensor data, keyed by
 *   each registry entry's `reportKey` (or `id` when no override is set).
 * @param {Record<string, object> | undefined} previous - The previous report's
 *   `sensors` map (or undefined on the first run), same keying.
 * @param {object} thresholds - Regression thresholds (persisted verbatim into the report).
 * @param {Date} [now] - Reference timestamp (injectable for tests; defaults to current time).
 * @returns {object} The sensor report — generated_at/period/sensors/thresholds/regressions/summary.
 */
export function buildReport(sensors, previous, thresholds, now = new Date()) {
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const reportSensors = getReportSensors();

  const regressions = reportSensors
    .filter((sensor) => typeof sensor.detectRegression === "function")
    .flatMap((sensor) => {
      const key = sensor.reportKey ?? sensor.id;
      return sensor.detectRegression(sensors[key], previous?.[key], thresholds) ?? [];
    });

  const availableCount = reportSensors.filter(
    (sensor) => sensors[sensor.reportKey ?? sensor.id]?.available
  ).length;
  const totalSensors = reportSensors.length;
  const regressedCount = regressions.length;

  return {
    generated_at: now.toISOString(),
    period: {
      start: sevenDaysAgo.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    },
    sensors,
    thresholds,
    regressions,
    summary: {
      sensors_available: availableCount,
      sensors_total: totalSensors,
      regressions_detected: regressedCount,
      status: regressedCount > 0 ? "regressions_detected" : "healthy",
    },
  };
}

/**
 * Render one human-readable display line per report-participating registry
 * entry, in registry order. Sensors without collected data (or with
 * `available: false`) render a "not available" placeholder.
 *
 * @param {Record<string, object>} sensors - Collected sensor data (same shape as buildReport's `sensors`).
 * @returns {string[]}
 */
export function formatSensorDisplay(sensors) {
  return getReportSensors().map((sensor) => {
    const key = sensor.reportKey ?? sensor.id;
    const data = sensors[key];
    if (!data?.available) {
      // A collector-reported `error` (e.g. GhAuthError — #3937) means the
      // query itself failed, not that the sensor legitimately has no data.
      // These must render as distinguishable lines, not both "not available".
      return data?.error ? `${key}: ⏭  query failed — ${data.error}` : `${key}: ⏭  not available`;
    }
    return typeof sensor.format === "function" ? sensor.format(data, key) : `${key}: available`;
  });
}
