#!/usr/bin/env node
/**
 * Filter a `gh pr list --json ...` array to agent-authored PRs using the
 * canonical predicate (scripts/lib/agent-pr.mjs). Reads a JSON array from the
 * file argument or stdin; writes the filtered JSON array to stdout. Used by
 * .github/workflows/ai-audit.yml in place of an inline jq copy (#6380).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAgentPr } from "./lib/agent-pr.mjs";

/** @param {unknown} prs @returns {object[]} */
export function filterAgentPrs(prs) {
  if (!Array.isArray(prs)) throw new Error("expected a JSON array of pull requests");
  return prs.filter(isAgentPr);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = process.argv[2] ?? 0;
  process.stdout.write(
    `${JSON.stringify(filterAgentPrs(JSON.parse(readFileSync(source, "utf8"))))}\n`
  );
}
