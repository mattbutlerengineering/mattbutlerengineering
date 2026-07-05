/**
 * scripts/process-a11y-results.mjs
 * Parses Vitest JSON output, segments violations by author type, and exits
 * non-zero when AI-generated code introduces a11y regressions.
 */
import fs from "node:fs";
import { append } from "./metrics-store.mjs";

const RESULTS_FILE = "a11y-results.json";
const VIOLATIONS_FILE = "a11y-violations.json";

/**
 * Extract failed assertions from Vitest JSON output.
 * @param {{ testResults?: Array<{ assertionResults: Array<{ status: string, fullName: string, failureMessages: string[] }> }> }} results
 * @returns {Array<{ name: string, error: string }>}
 */
export function extractViolations(results) {
  if (!results.testResults) return [];
  const violations = [];
  for (const suite of results.testResults) {
    for (const assertion of suite.assertionResults) {
      if (assertion.status === "failed") {
        violations.push({
          name: assertion.fullName,
          error: assertion.failureMessages[0] ?? "unknown error",
        });
      }
    }
  }
  return violations;
}

/**
 * Build a structured history entry from test results.
 * @param {object} results - Vitest JSON output
 * @param {string} branch - Git branch name
 * @param {string} actor - GitHub actor
 * @returns {object}
 */
export function buildEntry(results, branch, actor) {
  const isAgent =
    branch.startsWith("agent-") || branch.startsWith("worktree-agent-") || actor.includes("bot");

  return {
    timestamp: new Date().toISOString(),
    branch,
    actor,
    isAgent,
    numTests: results.numTotalTests,
    numPasses: results.numPassedTests,
    numFailures: results.numFailedTests,
    violations: extractViolations(results),
  };
}

/**
 * Decide whether to fail the build based on the entry.
 * Only agent branches fail on a11y violations; human branches are advisory.
 * @param {{ isAgent: boolean, numFailures: number }} entry
 * @returns {boolean}
 */
export function shouldFailBuild(entry) {
  return entry.isAgent && entry.numFailures > 0;
}

function main() {
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`Results file not found: ${RESULTS_FILE}`);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf-8"));
  const branch = process.env.GITHUB_HEAD_REF || "local";
  const actor = process.env.GITHUB_ACTOR || "human";

  const entry = buildEntry(results, branch, actor);

  append("a11y-history", entry, { root: process.cwd() });

  // Write structured violations file for the PR comment step
  fs.writeFileSync(VIOLATIONS_FILE, JSON.stringify(entry, null, 2));

  const type = entry.isAgent ? "agent" : "human";
  console.log(`Processed a11y results for ${branch} (${type}): ${entry.numFailures} failures`);

  if (shouldFailBuild(entry)) {
    console.error(
      `FAIL: ${entry.numFailures} accessibility violation(s) detected in AI-generated code.`
    );
    for (const v of entry.violations) {
      console.error(`  - ${v.name}`);
    }
    process.exit(1);
  }
}

// Only run when executed directly, not when imported by tests
if (import.meta.url === new URL(process.argv[1], "file://").href) {
  main();
}
