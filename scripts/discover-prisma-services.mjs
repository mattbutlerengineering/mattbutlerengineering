#!/usr/bin/env node
// Single source of truth for "which services have Prisma schemas".
// Globs services/[name]/prisma/schema.prisma and returns the list of service names.
//
// Used by:
//   - scripts/check-destructive-migrations.js  (guard)
//   - .husky/pre-push                          (guard via check-destructive-migrations)
//   - .github/workflows/ci.yml                 (cache paths + migration job)
//
// CLI:
//   node scripts/discover-prisma-services.mjs          # prints space-separated list
//   node scripts/discover-prisma-services.mjs --check  # exit 1 if list is empty
//   node scripts/discover-prisma-services.mjs --json   # prints JSON array

import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * Discovers all services that have a Prisma schema at
 * services/<name>/prisma/schema.prisma (the canonical, non-generated path).
 *
 * @returns {string[]} Sorted array of service directory names.
 */
export function discoverPrismaServices() {
  const servicesDir = resolve(ROOT, "services");

  if (!existsSync(servicesDir)) {
    return [];
  }

  const entries = readdirSync(servicesDir, { withFileTypes: true });

  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => existsSync(resolve(servicesDir, name, "prisma", "schema.prisma")))
    .sort();
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const services = discoverPrismaServices();

  if (process.argv.includes("--check")) {
    if (services.length === 0) {
      console.error(
        "ERROR: No services with prisma/schema.prisma found under services/. " +
          "This is unexpected — check the services/ directory."
      );
      process.exit(1);
    }
    console.log(`Found ${services.length} Prisma service(s): ${services.join(", ")}`);
    process.exit(0);
  }

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(services) + "\n");
    process.exit(0);
  }

  // Default: space-separated for shell consumption
  process.stdout.write(services.join(" ") + "\n");
}
