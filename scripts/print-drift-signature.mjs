#!/usr/bin/env node
/**
 * `node scripts/print-drift-signature.mjs <report-path>` — thin CLI front
 * door onto `computeDriftSignature()` (#5084) for `nightly-compliance.yml`,
 * a plain-shell workflow step that can't `import` the lib directly.
 *
 * Prints the signature (and nothing else) to stdout so a workflow step can
 * capture it with `$(...)`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { computeDriftSignature } from "./lib/nightly-compliance-signature.mjs";

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("Usage: node scripts/print-drift-signature.mjs <report-path>");
    process.exit(1);
  }
  console.log(computeDriftSignature(readFileSync(reportPath, "utf-8")));
}
