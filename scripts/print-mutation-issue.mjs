#!/usr/bin/env node
/**
 * CLI: prints the mutation-testing failure issue (title, dedupe key, body,
 * recurrence comment) as a single JSON object, for the workflow to `jq`.
 *
 * Keeps the issue text in a unit-tested pure module instead of an inline
 * `printf` block in YAML — see format-mutation-issue.mjs for why that text
 * being state-driven is the actual #5614 fix.
 *
 * Usage:
 *   node scripts/print-mutation-issue.mjs \
 *     --state harness-broken --score n/a --threshold 80 \
 *     --run-url <url> --today 2026-09-21
 */
import { formatMutationIssue } from "./format-mutation-issue.mjs";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (key) {
      args[key] = argv[i + 1] ?? "";
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const rawScore = args.score ?? "n/a";
const score = rawScore === "n/a" || rawScore === "" ? "n/a" : Number(rawScore);

process.stdout.write(
  JSON.stringify(
    formatMutationIssue({
      state: args.state || "report-missing",
      score,
      threshold: Number(args.threshold ?? 80),
      runUrl: args["run-url"] ?? "",
      today: args.today ?? new Date().toISOString().slice(0, 10),
    })
  ) + "\n"
);
