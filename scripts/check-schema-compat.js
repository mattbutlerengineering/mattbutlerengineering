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
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SERVICES = ["users", "reservations", "agent"];

/** Pure check — returns per-service baseline presence, never logs or exits. */
export function findSchemaBaselineFindings(root = DEFAULT_ROOT, services = SERVICES) {
  return services.map((service) => {
    const baselinePath = join(root, "services", service, "src", "schemas", "schema-baseline.json");
    return { service, exists: existsSync(baselinePath) };
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-schema-compat.js");

if (isMain) {
  console.log("Checking schema baselines...\n");

  const results = findSchemaBaselineFindings();

  for (const { service, exists } of results) {
    console.log(exists ? `  ✓ ${service}` : `  ✗ ${service} — missing schema-baseline.json`);
  }

  console.log("");

  const missing = results.filter((r) => !r.exists);
  const exitCode = runCheck({
    name: "schema baselines",
    findings: missing,
    passMessage: "PASS: All baselines present. Full compat checks run via: pnpm test",
    failMessage: `FAIL: ${missing.length} service(s) missing baselines. Run: pnpm schema:baseline`,
  });
  process.exit(exitCode);
}
