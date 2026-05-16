#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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

function collectEnvVars(packageDir) {
  const vars = new Set();
  
  const files = globSync("**/*.{ts,tsx,js,jsx}", {
    cwd: packageDir,
    ignore: [
      "**/node_modules/**",
      "**/dist/**",
      "**/generated/**",
      "**/*.test.{ts,tsx,js,jsx}",
      "**/*.spec.{ts,tsx,js,jsx}",
    ],
  });

  for (const file of files) {
    const content = readFileSync(join(packageDir, file), "utf-8");
    
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

console.log("🔍 Checking .env.example completeness across monorepo...\n");

const exampleFiles = globSync("**/.env.example", {
  cwd: root,
  ignore: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
});

for (const exampleFile of exampleFiles) {
  const envExamplePath = join(root, exampleFile);
  const packageDir = dirname(envExamplePath);
  const packageRelativePath = relative(root, packageDir);

  const codeVars = collectEnvVars(packageDir);
  const exampleVars = parseEnvExample(envExamplePath);

  // Filter out platform vars
  const missing = [...codeVars]
    .filter((v) => !PLATFORM_VARS.has(v))
    .filter((v) => !exampleVars.has(v))
    .sort();

  if (missing.length === 0) {
    console.log(`  ✅ ${packageRelativePath}: all env vars documented`);
  } else {
    hasErrors = true;
    console.log(`  ❌ ${packageRelativePath}: MISSING from .env.example:`);
    for (const v of missing) {
      console.log(`     - ${v}`);
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
