#!/usr/bin/env node
// Guards against the class of gap in #4594: a Vite manualChunks vendor split
// that ships in dist/ with zero size-limit budget, so a regression in it is
// invisible to CI. Fails if any built `*-vendor-*.js` chunk above a "worth
// budgeting" size floor isn't matched by some `size-limit` path glob in
// package.json. Sub-floor chunks (e.g. sentry-vendor, ~1 kB) are exempt —
// requiring a budget on noise would make the guard require busywork instead
// of catching real regressions.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ASSETS_DIR = path.join(APP_DIR, "dist", "assets");
const VENDOR_CHUNK_PATTERN = /^(.+-vendor)-[^./]+\.js$/;
const MIN_BUDGET_WORTHY_BYTES = 5 * 1024; // below this, a chunk is noise, not a regression risk

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
}

function findUncoveredVendorChunks() {
  let files;
  try {
    files = readdirSync(ASSETS_DIR);
  } catch {
    throw new Error(`dist/assets not found at ${ASSETS_DIR} — run "pnpm build" before size:check.`);
  }

  const { "size-limit": sizeLimitConfig } = JSON.parse(
    readFileSync(path.join(APP_DIR, "package.json"), "utf8")
  );
  const coveragePatterns = sizeLimitConfig.map(({ path: p }) => globToRegExp(p));

  return files
    .filter((file) => VENDOR_CHUNK_PATTERN.test(file))
    .filter((file) => statSync(path.join(ASSETS_DIR, file)).size >= MIN_BUDGET_WORTHY_BYTES)
    .filter((file) => {
      const relativePath = `dist/assets/${file}`;
      return !coveragePatterns.some((pattern) => pattern.test(relativePath));
    });
}

const uncovered = findUncoveredVendorChunks();
if (uncovered.length > 0) {
  console.error(
    `size-limit is missing a budget for ${uncovered.length} vendor chunk(s):\n` +
      uncovered.map((file) => `  - ${file}`).join("\n") +
      '\nAdd a "size-limit" entry in apps/hospitality/package.json for each.'
  );
  process.exit(1);
}

console.log("All budget-worthy vendor chunks have size-limit coverage.");
