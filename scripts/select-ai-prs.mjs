#!/usr/bin/env node
/**
 * Filter a `gh pr list --json ...` array down to agent PRs using the one
 * canonical predicate (`isAgentPr`, #6380). Replaces the inline jq that
 * `.github/workflows/ai-audit.yml` used to carry its own copy of.
 *
 * Usage: node scripts/select-ai-prs.mjs <prs.json>
 * Prints the filtered JSON array to stdout. Exits 1 on unreadable or
 * non-array input rather than emitting an empty (reassuring) list.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAgentPr } from "../plugins/acmm/scripts/agent-pr.js";

/** @param {unknown} prs @returns {unknown[]} */
export function selectAiPrs(prs) {
  if (!Array.isArray(prs)) throw new Error("expected a JSON array of PRs");
  return prs.filter(isAgentPr);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const input = JSON.parse(readFileSync(process.argv[2], "utf-8"));
    process.stdout.write(`${JSON.stringify(selectAiPrs(input))}\n`);
  } catch (err) {
    process.stderr.write(`select-ai-prs: ${err.message}\n`);
    process.exit(1);
  }
}
