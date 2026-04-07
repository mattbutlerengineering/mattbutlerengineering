#!/usr/bin/env node

/**
 * Architecture fitness test: verifies that environment variables referenced in
 * service source code are documented in the corresponding .env.example file.
 *
 * Scans process.env references in service src/ directories (excluding generated
 * code) and checks each one appears in .env.example.
 *
 * Some env vars are platform-injected and don't belong in .env.example — these
 * are explicitly excluded.
 *
 * Usage: node scripts/check-env-sync.js
 * Exit code: 0 if in sync, 1 if missing vars found
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SERVICES = ["users", "reservations", "agent"];

// Env vars injected by platform/runtime — not expected in .env.example
const PLATFORM_VARS = new Set([
  "NODE_ENV",
  "DEBUG",
  "HOME",
  "PATH",
  "CI",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_SERVICE_NAME",
  "SENTRY_RELEASE",
  "PRISMA_CONNECTION_LIMIT",
]);

function collectEnvVars(dir) {
  const vars = new Set();

  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "generated" || entry.name === "node_modules") continue;

      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        const content = readFileSync(fullPath, "utf-8");
        const re = /process\.env\.(\w+)/g;
        let m;
        while ((m = re.exec(content)) !== null) {
          vars.add(m[1]);
        }
      }
    }
  }

  walk(dir);
  return vars;
}

function parseEnvExample(filePath) {
  if (!existsSync(filePath)) return new Set();
  const content = readFileSync(filePath, "utf-8");
  const vars = new Set();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Match both active and commented-out vars: VAR=value or # VAR=value
    const m = trimmed.match(/^#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (m) {
      vars.add(m[1]);
    }
  }
  return vars;
}

// Run
let hasErrors = false;

console.log("Checking .env.example completeness for all services...\n");

for (const service of SERVICES) {
  const srcDir = join(root, "services", service, "src");
  const envExamplePath = join(root, "services", service, ".env.example");

  const codeVars = collectEnvVars(srcDir);
  const exampleVars = parseEnvExample(envExamplePath);

  // Filter out platform vars
  const missing = [...codeVars]
    .filter((v) => !PLATFORM_VARS.has(v))
    .filter((v) => !exampleVars.has(v))
    .sort();

  if (missing.length === 0) {
    console.log(`  ${service}: all env vars documented in .env.example`);
  } else {
    hasErrors = true;
    console.log(`  ${service}: MISSING from .env.example:`);
    for (const v of missing) {
      console.log(`    - ${v}`);
    }
  }
}

console.log("");

if (hasErrors) {
  console.log(
    "FAIL: Some env vars used in code are not documented in .env.example.\n" +
      "Add missing vars to the corresponding .env.example file.\n" +
      "If a var is platform-injected, add it to PLATFORM_VARS in this script."
  );
  process.exit(1);
} else {
  console.log("PASS: All env vars are documented in .env.example files.");
}
