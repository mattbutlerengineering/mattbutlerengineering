#!/usr/bin/env node

/**
 * Unified sensor aggregation for the learning loop.
 *
 * Queries all available sensors, computes week-over-week deltas,
 * detects regressions, and writes a structured report.
 *
 * This is a thin CLI shim: it collects each registry sensor's data (IO),
 * hands it to the pure `buildReport`/`formatSensorDisplay` (build-sensor-report.mjs),
 * then prints/persists the result and exits. Adding a sensor — including one
 * with a regression threshold — means adding one entry to sensors-registry.mjs
 * (thresholds live on the entry, next to its `detectRegression`, and are
 * assembled here via `buildThresholds()`) — this file does not change.
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
import {
  getReportSensors,
  safe,
  readJson,
  collectReportSensors,
  buildThresholds,
} from "./sensors-registry.mjs";
import { buildReport, formatSensorDisplay } from "./build-sensor-report.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPORT_PATH = resolve(ROOT, "metrics", "sensor-report.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const JSON_ONLY = args.includes("--json");

const now = new Date();
const ghClient = createGhClient();
const ctx = { root: ROOT, now, ghClient };

/* ── Collect (IO) — iterates the registry so adding a sensor needs no shim change ── */

const collectedSensors = collectReportSensors(getReportSensors(), ctx);

const previousReport = safe(() => readJson(REPORT_PATH));
const report = buildReport(collectedSensors, previousReport?.sensors, buildThresholds(), now);

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
