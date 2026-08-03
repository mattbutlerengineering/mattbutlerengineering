#!/usr/bin/env node
/**
 * CLI: reads a Stryker mutation.json report and prints the computed
 * mutation score as `key=value` lines, one per line — the format
 * `$GITHUB_OUTPUT` expects.
 *
 * Delegates to collectMutationScore() (the same collector the quality
 * sensor registry uses) instead of reading the report's nonexistent
 * top-level `.metrics.mutationScore` field, so the mutation-testing
 * workflow's job summary, PR comment, and threshold check all agree.
 *
 * Usage: node scripts/print-mutation-score.mjs [reportPath]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectMutationScore } from "./collect-mutation-score.mjs";
import { formatMutationOutputs } from "./format-mutation-output.mjs";

function readReport(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const reportPath = resolve(process.argv[2] ?? "reports/mutation/mutation.json");
const outputs = formatMutationOutputs(collectMutationScore(readReport(reportPath)));

for (const [key, value] of Object.entries(outputs)) {
  process.stdout.write(`${key}=${value}\n`);
}
