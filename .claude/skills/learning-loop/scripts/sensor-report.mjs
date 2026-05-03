#!/usr/bin/env node
/**
 * Sensor Report - Collects metrics from all available sensors
 * Outputs to metrics/sensor-report.json
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const METRICS_DIR = path.join(process.cwd(), 'metrics');
const OUTPUT_FILE = path.join(METRICS_DIR, 'sensor-report.json');
const PREV_FILE = path.join(METRICS_DIR, 'sensor-report-prev.json');

// Ensure metrics directory exists
if (!fs.existsSync(METRICS_DIR)) {
  fs.mkdirSync(METRICS_DIR, { recursive: true });
}

const report = {
  timestamp: new Date().toISOString(),
  sensors: {},
  regressions: [],
  summary: { available: 0, total: 7 }
};

// Helper to safely run commands
function safeRun(cmd, fallback = null) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch {
    return fallback;
  }
}

// Sensor 1: ACMM (AI Codebase Maturity Model - read cached state)
console.log('Checking ACMM...');
try {
  const stateFile = '.claude/acmm/state.json';
  if (fs.existsSync(stateFile)) {
    const acmm = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    report.sensors.acmm = {
      available: true,
      level: acmm.level || 'unknown',
      score: acmm.score || 0,
      gaps: acmm.gaps?.length || 0
    };
  } else {
    report.sensors.acmm = { available: false, note: 'no cached state' };
  }
  report.summary.available++;
} catch {
  report.sensors.acmm = { available: false };
}

// Sensor 2: CI Health
console.log('Checking CI health...');
try {
  const ciStatus = safeRun('gh run list --limit 10 --json conclusion,status --jq "[.[] | select(.status==\"completed\") | .conclusion]"', '[]');
  const runs = JSON.parse(ciStatus || '[]');
  const passes = runs.filter(r => r === 'success').length;
  const total = runs.length;
  report.sensors.ci = {
    available: true,
    passRate: total > 0 ? (passes / total * 100).toFixed(1) : 100,
    recentRuns: total
  };
  report.summary.available++;
} catch {
  report.sensors.ci = { available: false };
}

// Sensor 3: PR Metrics
console.log('Checking PR metrics...');
try {
  const prs = safeRun('gh pr list --state all --limit 20 --json createdAt,mergedAt,state --jq "[.[] | select(.mergedAt != null)]"', '[]');
  const merged = JSON.parse(prs || '[]');
  report.sensors.prMetrics = {
    available: true,
    merged30d: merged.length,
    avgMergeTime: 'unknown'
  };
  report.summary.available++;
} catch {
  report.sensors.prMetrics = { available: false };
}

// Sensor 4: GitHub Issues
console.log('Checking issue metrics...');
try {
  const openIssues = safeRun('gh issue list --state open --json number --jq length', '0');
  const readyIssues = safeRun('gh issue list --state open --label ready --json number --jq length', '0');
  report.sensors.issues = {
    available: true,
    open: parseInt(openIssues) || 0,
    ready: parseInt(readyIssues) || 0
  };
  report.summary.available++;
} catch {
  report.sensors.issues = { available: false };
}

// Sensor 5: Lighthouse (check for config)
console.log('Checking Lighthouse...');
const hasLighthouse = fs.existsSync('lighthouserc.js') || fs.existsSync('.lighthouserc');
report.sensors.lighthouse = {
  available: hasLighthouse,
  note: hasLighthouse ? 'config found' : 'no config'
};
if (hasLighthouse) report.summary.available++;

// Sensor 6: Sentry (check for config)
console.log('Checking Sentry...');
const hasSentry = fs.existsSync('packages/sentry') || safeRun('grep -r "sentry" packages/*/package.json 2>/dev/null', '') !== '';
report.sensors.sentry = {
  available: !!hasSentry,
  note: hasSentry ? 'configured' : 'not configured'
};
if (hasSentry) report.summary.available++;

// Sensor 7: Agent Cost (check logs)
console.log('Checking agent cost logs...');
const hasAgentLogs = fs.existsSync('.claude/improvement-loop/log.md');
report.sensors.agentCost = {
  available: hasAgentLogs,
  note: hasAgentLogs ? 'log found' : 'no log'
};
if (hasAgentLogs) report.summary.available++;

// Detect regressions by comparing with previous report
if (fs.existsSync(PREV_FILE)) {
  try {
    const prev = JSON.parse(fs.readFileSync(PREV_FILE, 'utf-8'));
    for (const [name, sensor] of Object.entries(report.sensors)) {
      if (!sensor.available || !prev.sensors?.[name]?.available) continue;
      
      // Check CI regression
      if (name === 'ci' && sensor.passRate < prev.sensors[name].passRate - 10) {
        report.regressions.push({
          sensor: name,
          metric: 'passRate',
          current: sensor.passRate,
          previous: prev.sensors[name].passRate,
          delta: `${(sensor.passRate - prev.sensors[name].passRate).toFixed(1)}%`
        });
      }
      
      // Check ACMM regression
      if (name === 'acmm' && sensor.score < prev.sensors[name].score) {
        report.regressions.push({
          sensor: name,
          metric: 'score',
          current: sensor.score,
          previous: prev.sensors[name].score,
          delta: sensor.score - prev.sensors[name].score
        });
      }
    }
  } catch (e) {
    console.log('Could not compare with previous report:', e.message);
  }
}

// Save current as previous for next run
if (fs.existsSync(OUTPUT_FILE)) {
  fs.copyFileSync(OUTPUT_FILE, PREV_FILE);
}

// Write report
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

console.log(`\n=== Sensor Report ===`);
console.log(`Sensors available: ${report.summary.available}/${report.summary.total}`);
console.log(`Regressions detected: ${report.regressions.length}`);
if (report.regressions.length > 0) {
  console.log('Regressions:', JSON.stringify(report.regressions, null, 2));
  process.exit(1); // Exit with error to signal regressions
}
process.exit(0);
