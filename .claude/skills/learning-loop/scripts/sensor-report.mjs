#!/usr/bin/env node
/**
 * Sensor Report - Collects metrics from all available sensors
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const METRICS_DIR = path.join(process.cwd(), 'metrics');
const OUTPUT_FILE = path.join(METRICS_DIR, 'sensor-report.json');
const PREV_FILE = path.join(METRICS_DIR, 'sensor-report-prev.json');

if (!fs.existsSync(METRICS_DIR)) fs.mkdirSync(METRICS_DIR, { recursive: true });

const report = { timestamp: new Date().toISOString(), sensors: {}, regressions: [], summary: { available: 0, total: 7 } };

function safeRun(cmd, fallback = null) {
  try { return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' }).trim(); } catch { return fallback; }
}

// Sensor 1: ACMM
console.log('Checking ACMM...');
try {
  const stateFile = '.claude/acmm/state.json';
  if (fs.existsSync(stateFile)) {
    const acmm = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    report.sensors.acmm = { available: true, level: acmm.level || 'unknown', score: acmm.score || 0, gaps: acmm.gaps?.length || 0 };
  } else { report.sensors.acmm = { available: false, note: 'no cached state' }; }
  report.summary.available++;
} catch { report.sensors.acmm = { available: false }; }

// Sensor 2: CI Health
console.log('Checking CI health...');
try {
  const ciStatus = safeRun('gh run list --limit 10 --json conclusion,status --jq "[.[] | select(.status==\"completed\") | .conclusion]"', '[]');
  const runs = JSON.parse(ciStatus || '[]');
  const passes = runs.filter(r => r === 'success').length;
  report.sensors.ci = { available: true, passRate: runs.length > 0 ? (passes / runs.length * 100).toFixed(1) : 100, recentRuns: runs.length };
  report.summary.available++;
} catch { report.sensors.ci = { available: false }; }

// Sensor 3: PR Metrics
console.log('Checking PR metrics...');
try {
  const prs = safeRun('gh pr list --state all --limit 20 --json createdAt,mergedAt --jq "[.[] | select(.mergedAt != null)]"', '[]');
  report.sensors.prMetrics = { available: true, merged30d: JSON.parse(prs || '[]').length };
  report.summary.available++;
} catch { report.sensors.prMetrics = { available: false }; }

// Sensor 4: GitHub Issues
console.log('Checking issue metrics...');
try {
  report.sensors.issues = { available: true, open: parseInt(safeRun('gh issue list --state open --json number --jq length', '0')) || 0, ready: parseInt(safeRun('gh issue list --state open --label ready --json number --jq length', '0')) || 0 };
  report.summary.available++;
} catch { report.sensors.issues = { available: false }; }

// Sensor 5: Lighthouse (inventory)
console.log('Checking Lighthouse...');
const inventoryPath = '.audit-state/inventory.json';
const hasInventory = fs.existsSync(inventoryPath);
if (hasInventory) {
  try {
    const inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf-8'));
    const checked = inv.surfaces?.filter(s => s.lastChecked).length || 0;
    report.sensors.lighthouse = { available: true, surfacesChecked: checked, surfacesTotal: inv.surfaces?.length || 0, note: checked > 0 ? `${checked}/${inv.surfaces?.length || 0} checked` : 'needs first run' };
  } catch { report.sensors.lighthouse = { available: true, note: 'parse error' }; }
  report.summary.available++;
} else { report.sensors.lighthouse = { available: false, note: 'no inventory' }; }

// Sensor 6: Sentry (API)
console.log('Checking Sentry...');
const SENTRY_TOKEN = process.env.SENTRY_ACCESS_TOKEN;
if (SENTRY_TOKEN) {
  try {
    const response = await fetch('https://sentry.io/api/0/organizations/mattbutlerengineering/issues/?statsPeriod=7d&limit=10', { headers: { 'Authorization': `Bearer ${SENTRY_TOKEN}` } });
    if (response.ok) {
      const issues = await response.json();
      const errorCount = issues.filter(i => i.level === 'error' || i.level === 'fatal').length;
      report.sensors.sentry = { available: true, totalIssues: issues.length, errorCount, note: errorCount === 0 ? 'healthy' : `${errorCount} errors` };
      report.summary.available++;
    } else { report.sensors.sentry = { available: false, note: 'api error' }; }
  } catch { report.sensors.sentry = { available: false, note: 'network error' }; }
} else { report.sensors.sentry = { available: false, note: 'no token' }; }

// Sensor 7: Agent Cost
console.log('Checking agent cost logs...');
const spendFile = '.claude/agent-spend/sessions.jsonl';
const hasSpend = fs.existsSync(spendFile);
if (hasSpend) {
  try {
    const lines = fs.readFileSync(spendFile, 'utf-8').trim().split('\n').filter(Boolean);
    report.sensors.agentCost = { available: true, sessions: lines.length };
    report.summary.available++;
  } catch { report.sensors.agentCost = { available: true, note: 'parse error' }; report.summary.available++; }
} else { report.sensors.agentCost = { available: false, note: 'no spend log' }; }

// Save report
if (fs.existsSync(OUTPUT_FILE)) fs.copyFileSync(OUTPUT_FILE, PREV_FILE);
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));

console.log(`\n=== Sensor Report ===`);
console.log(`Sensors available: ${report.summary.available}/${report.summary.total}`);
console.log(`Regressions: ${report.regressions.length}`);
process.exit(report.regressions.length > 0 ? 1 : 0);
