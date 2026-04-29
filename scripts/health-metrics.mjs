#!/usr/bin/env node

/**
 * Service health metrics persistence for ACMM L3 signal.
 *
 * Polls the /health endpoints of production services, extracts error rates,
 * and appends a snapshot to metrics/service-health.jsonl.
 *
 * Usage:
 *   node scripts/health-metrics.mjs
 *   node scripts/health-metrics.mjs --dry-run
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const cwd = process.cwd();
const HISTORY_PATH = join(cwd, 'metrics/service-health.jsonl');

const BASE = 'https://api.mattbutlerengineering.com';

const SERVICES = [
  { name: 'users', url: `${BASE}/api/v1/users/health` },
  { name: 'agent', url: `${BASE}/api/gen/health` },
  { name: 'reservations', url: `${BASE}/api/v1/reservations/health` },
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function fetchHealth(service) {
  try {
    const res = await fetch(service.url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      service: service.name,
      status: data.status,
      error_rates: data.checks?.error_rates || null,
      latency_ms: data.checks?.database?.latency ?? null,
    };
  } catch (err) {
    return {
      service: service.name,
      status: 'error',
      message: err.message,
    };
  }
}

async function run() {
  console.log('Polling production service health...');
  const results = await Promise.all(SERVICES.map(fetchHealth));

  const entry = {
    timestamp: new Date().toISOString(),
    services: results,
  };

  if (DRY_RUN) {
    console.log('Dry run - snapshot:');
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  mkdirSync(dirname(HISTORY_PATH), { recursive: true });
  appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n', 'utf-8');
  console.log(`Snapshot appended to ${HISTORY_PATH}`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
