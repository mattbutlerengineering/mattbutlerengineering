#!/usr/bin/env node
/**
 * CLI: reads a Stryker mutation.json report and prints the job-summary
 * markdown (score, threshold, status, top surviving mutants) for
 * `$GITHUB_STEP_SUMMARY`.
 *
 * Usage: node scripts/print-mutation-summary.mjs [reportPath] [runUrl]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectMutationScore, collectTopSurvivedMutants } from "./collect-mutation-score.mjs";
import { formatMutationSummary } from "./format-mutation-summary.mjs";

function readReport(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const [, , reportPathArg, runUrl] = process.argv;
const reportPath = resolve(reportPathArg ?? "reports/mutation/mutation.json");
const report = readReport(reportPath);

const scoreResult = collectMutationScore(report);
const survivedMutants = collectTopSurvivedMutants(report);

process.stdout.write(formatMutationSummary({ scoreResult, survivedMutants, runUrl }));
