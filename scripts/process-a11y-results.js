/**
 * scripts/process-a11y-results.js
 * Parses Vitest JSON output and segments accessibility violations by author type.
 */
import fs from 'node:fs';
import path from 'node:path';

const RESULTS_FILE = 'a11y-results.json';
const HISTORY_FILE = 'metrics/a11y-history.jsonl';

function main() {
  if (!fs.existsSync(RESULTS_FILE)) {
    console.error(`Results file not found: ${RESULTS_FILE}`);
    process.exit(1);
  }

  const results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));
  const branch = process.env.GITHUB_HEAD_REF || 'local';
  const actor = process.env.GITHUB_ACTOR || 'human';
  const isAgent = branch.startsWith('agent-') || branch.startsWith('worktree-agent-') || actor.includes('bot');

  const entry = {
    timestamp: new Date().toISOString(),
    branch,
    actor,
    isAgent,
    numTests: results.numTotalTests,
    numPasses: results.numPassedTests,
    numFailures: results.numFailedTests,
    violations: [],
  };

  // Extract violation details from test failure messages if possible
  if (results.testResults) {
    results.testResults.forEach(suite => {
      suite.assertionResults.forEach(assertion => {
        if (assertion.status === 'failed') {
          entry.violations.push({
            name: assertion.fullName,
            error: assertion.failureMessages[0],
          });
        }
      });
    });
  }

  // Ensure metrics directory exists
  const metricsDir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(metricsDir)) {
    fs.mkdirSync(metricsDir, { recursive: true });
  }

  fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
  console.log(`Processed a11y results for ${branch} (${isAgent ? 'agent' : 'human'})`);
}

main();
