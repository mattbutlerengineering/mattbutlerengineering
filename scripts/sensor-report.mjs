#!/usr/bin/env node

/**
 * Unified sensor aggregation for the learning loop.
 *
 * Queries all available sensors, computes week-over-week deltas,
 * detects regressions, and writes a structured report.
 *
 * This is a thin CLI shim: it collects each registry sensor's data (IO),
 * hands it to the pure `buildReport`/`formatSensorDisplay` (build-sensor-report.mjs),
 * then prints/persists the result and exits. Adding a sensor means adding one
 * entry to sensors-registry.mjs — this file does not change.
 *
 * Usage:
 *   node scripts/sensor-report.mjs              # full report
 *   node scripts/sensor-report.mjs --dry-run    # print only, do not persist
 *   node scripts/sensor-report.mjs --json       # output raw JSON to stdout
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient } from "@mbe/gh-client";
import { CODE_CHURN_THRESHOLD } from "./collect-code-churn.mjs";
import {
  QUEUE_EFFICIENCY_COMPOSITE_DROP,
  QUEUE_EFFICIENCY_FPS_DROP,
} from "./collect-queue-efficiency.mjs";
import { getReportSensors, safe, readJson } from "./sensors-registry.mjs";
import { buildReport, formatSensorDisplay } from "./build-sensor-report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "metrics", "sensor-report.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const JSON_ONLY = args.includes("--json");

const THRESHOLDS = {
  lighthouse_score_drop: 0.05,
  ci_pass_rate_drop: 5,
  agent_success_rate_drop: 10,
  error_rate_increase: 20,
  service_uptime_min: 99.5,
  code_churn_rate_max: CODE_CHURN_THRESHOLD,
  queue_efficiency_composite_drop: QUEUE_EFFICIENCY_COMPOSITE_DROP,
  queue_efficiency_fps_drop: QUEUE_EFFICIENCY_FPS_DROP,
};

const now = new Date();
const ghClient = createGhClient();
const ctx = { root: ROOT, now, ghClient };

/* ── Collect (IO) — iterates the registry so adding a sensor needs no shim change ── */

const collectedSensors = Object.fromEntries(
  getReportSensors().map((sensor) => [
    sensor.reportKey ?? sensor.id,
    safe(() => sensor.collect(ctx), { available: false }),
  ])
);

const previousReport = safe(() => readJson(REPORT_PATH));
const report = buildReport(collectedSensors, previousReport?.sensors, THRESHOLDS, now);

/* ── Output (IO) ──────────────────────────────────────────────────────── */

if (JSON_ONLY) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  console.log(`\n📊 Sensor Report — ${report.period.start} to ${report.period.end}`);
  console.log(
    `   Sensors: ${report.summary.sensors_available}/${report.summary.sensors_total} available`
  );
  console.log(
    `   Status:  ${report.summary.regressions_detected > 0 ? `⚠️  ${report.summary.regressions_detected} regression(s)` : "✅ Healthy"}`
  );
  console.log();

  for (const line of formatSensorDisplay(report.sensors)) {
    console.log(`   ${line}`);
  }

  if (report.summary.regressions_detected > 0) {
    console.log("\n   Regressions:");
    for (const r of report.regressions) {
      console.log(
        `   ⚠️  ${r.sensor}.${r.metric}: ${r.previous} → ${r.current} (${r.delta > 0 ? "+" : ""}${r.delta}) [${r.severity}]`
      );
    }
  }

  console.log();
}

if (!DRY_RUN) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  if (!JSON_ONLY) console.log(`   Written to: ${REPORT_PATH}\n`);
}

process.exit(report.summary.regressions_detected > 0 ? 1 : 0);
