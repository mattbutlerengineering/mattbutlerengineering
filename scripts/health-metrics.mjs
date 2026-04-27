#!/usr/bin/env node

/**
 * Service health metrics persistence for ACMM L3 signal.
 * 
 * Polls the /health endpoints of local services, extracts error rates,
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

const SERVICES = [
  { name: 'users', port: 3001, path: '/health' },
  { name: 'agent', port: 3003, path: '/health' },
  { name: 'reservations', port: 3004, path: '/health' }
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function fetchHealth(service) {
  const url = `http://localhost:${service.port}${service.path}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      service: service.name,
      status: data.status,
      error_rates: data.error_rates || null
    };
  } catch (err) {
    return {
      service: service.name,
      status: 'error',
      message: err.message
    };
  }
}

async function run() {
  console.log('Polling service health...');
  const results = await Promise.all(SERVICES.map(fetchHealth));
  
  const entry = {
    timestamp: new Date().toISOString(),
    services: results
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
