#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { walkFiles } from "./lib/repo-scan.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  "DEV",
  "PROD",
  "MODE",
  "SSR",
  "BASE_URL",
]);

const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE_RE = /\.(test|spec)\.(ts|tsx|js|jsx)$/;

export function collectEnvVars(packageDir) {
  const vars = new Set();

  const files = walkFiles(packageDir, {
    match: (name) => SOURCE_EXT_RE.test(name) && !TEST_FILE_RE.test(name),
  });

  for (const file of files) {
    const content = readFileSync(file, "utf-8");

    // Match process.env.VAR
    const processRe = /process\.env\.(\w+)/g;
    let m;
    while ((m = processRe.exec(content)) !== null) {
      vars.add(m[1]);
    }

    // Match import.meta.env.VAR
    const metaRe = /import\.meta\.env\.(\w+)/g;
    while ((m = metaRe.exec(content)) !== null) {
      vars.add(m[1]);
    }
  }

  return vars;
}

export function parseEnvExample(filePath) {
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

/**
 * Pure aggregation across every `.env.example` in the repo — returns, per
 * package, which code-referenced env vars are missing from its example file.
 */
export function findEnvSyncFindings(root = DEFAULT_ROOT) {
  const exampleFiles = walkFiles(root, { match: (name) => name === ".env.example" });

  return exampleFiles.map((envExamplePath) => {
    const packageDir = dirname(envExamplePath);
    const packageRelativePath = relative(root, packageDir);

    const codeVars = collectEnvVars(packageDir);
    const exampleVars = parseEnvExample(envExamplePath);

    const missing = [...codeVars]
      .filter((v) => !PLATFORM_VARS.has(v))
      .filter((v) => !exampleVars.has(v))
      .sort();

    return { packageRelativePath, missing };
  });
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-env-sync.js");

if (isMain) {
  console.log("🔍 Checking .env.example completeness across monorepo...\n");

  const results = findEnvSyncFindings();

  for (const { packageRelativePath, missing } of results) {
    if (missing.length === 0) {
      console.log(`  ✅ ${packageRelativePath}: all env vars documented`);
    } else {
      console.log(`  ❌ ${packageRelativePath}: MISSING from .env.example:`);
      for (const v of missing) {
        console.log(`     - ${v}`);
      }
    }
  }

  console.log("");

  const findings = results.filter((r) => r.missing.length > 0);
  const exitCode = runCheck({
    name: "env sync",
    findings,
    passMessage: "PASS: All env vars are documented in .env.example files.",
    failMessage:
      "FAIL: Some env vars used in code are not documented in .env.example.\n" +
      "Add missing vars to the corresponding .env.example file.\n" +
      "If a var is platform-injected, add it to PLATFORM_VARS in this script.",
  });
  process.exit(exitCode);
}
