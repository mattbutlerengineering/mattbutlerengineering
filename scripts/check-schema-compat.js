#!/usr/bin/env node

/**
 * Verifies that schema baseline files exist for all services.
 *
 * The actual semantic compatibility checking happens in each service's
 * Vitest test suite (schemas.test.ts), which imports compareSchema from
 * @mbe/types/schema-compat and compares current schemas against baselines.
 *
 * This script is a lightweight CI smoke check that ensures baselines
 * haven't been accidentally deleted.
 *
 * Usage: node scripts/check-schema-compat.js
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SERVICES = ["users", "reservations", "agent"];
let missing = 0;

console.log("Checking schema baselines...\n");

for (const service of SERVICES) {
  const baselinePath = join(
    root, "services", service, "src", "schemas", "schema-baseline.json"
  );

  if (existsSync(baselinePath)) {
    console.log(`  ✓ ${service}`);
  } else {
    console.log(`  ✗ ${service} — missing schema-baseline.json`);
    missing++;
  }
}

if (missing > 0) {
  console.log(
    `\nFAIL: ${missing} service(s) missing baselines. Run: pnpm schema:baseline`
  );
  process.exit(1);
} else {
  console.log("\nPASS: All baselines present. Full compat checks run via: pnpm test");
}
