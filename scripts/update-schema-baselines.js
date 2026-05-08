#!/usr/bin/env node

/**
 * Updates schema baseline JSON files for backward compatibility checking.
 *
 * Reads each service's schema exports (via dynamic import with tsx) and
 * writes a schema-baseline.json keyed by $id.
 *
 * Usage: pnpm schema:baseline
 * Requires: tsx (available via @mbe/cli workspace)
 */

import { writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SERVICES = ["users", "reservations", "agent"];

for (const service of SERVICES) {
  const schemasPath = join(root, "services", service, "src", "schemas", "index.ts");
  if (!existsSync(schemasPath)) {
    console.log(`  SKIP: ${service} — no schemas/index.ts`);
    continue;
  }

  // Dynamic import of TypeScript (requires tsx or compatible loader)
  const mod = await import(schemasPath);

  const baseline = {};
  for (const [exportName, value] of Object.entries(mod)) {
    if (value && typeof value === "object" && "$id" in value && "properties" in value) {
      // Deep clone to strip TypeScript readonly markers
      baseline[value.$id] = JSON.parse(JSON.stringify(value));
    }
  }

  const outPath = join(root, "services", service, "src", "schemas", "schema-baseline.json");
  writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`  ${service}: wrote ${Object.keys(baseline).length} schemas → ${outPath}`);
}

console.log("\nDone. Commit the updated baseline files.");
