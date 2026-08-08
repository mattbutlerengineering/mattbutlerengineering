#!/usr/bin/env node

/**
 * Onboarding Benchmark -- measures 'codebase as model' effectiveness.
 *
 * Defines tasks of increasing difficulty and records timing/success.
 * Designed to be run by an agent session to measure how quickly it
 * can complete tasks using only the repo's instruction files and patterns.
 *
 * Usage:
 *   node plugins/acmm/scripts/onboarding-benchmark.js           # describe tasks
 *   node plugins/acmm/scripts/onboarding-benchmark.js --record   # record a result
 */

import fs from "node:fs";
import path from "node:path";

const RESULTS_PATH = path.resolve(".claude/acmm/onboarding-benchmark.json");

const TASKS = [
  {
    id: "trivial-file-access",
    difficulty: "trivial",
    description: "Add a TODO comment to CLAUDE.md",
    measures: "Basic file read/write capability, instruction file awareness",
    successCriteria: "CLAUDE.md contains a new TODO comment",
    expectedMinutes: 1,
  },
  {
    id: "easy-test-suite",
    difficulty: "easy",
    description: "Run the test suite and report the number of passing/failing tests",
    measures: "Repo navigation, package manager awareness, test runner knowledge",
    successCriteria: "Accurate report of test results with pass/fail counts",
    expectedMinutes: 3,
  },
  {
    id: "medium-lint-fix",
    difficulty: "medium",
    description: "Find and fix all ESLint errors in a specific file without introducing new ones",
    measures: "Tool chain knowledge, lint configuration understanding",
    successCriteria: "File passes eslint with zero errors",
    expectedMinutes: 5,
  },
  {
    id: "hard-api-endpoint",
    difficulty: "hard",
    description: "Add a new GET /api/v1/users/stats endpoint following existing patterns",
    measures: "Pattern recognition, service architecture understanding, test writing",
    successCriteria: "Endpoint works, follows existing patterns, has tests, passes CI checks",
    expectedMinutes: 15,
  },
  {
    id: "expert-cross-service",
    difficulty: "expert",
    description: "Implement a feature that spans two services with proper API contracts",
    measures: "Multi-service architecture, API design, integration understanding",
    successCriteria: "Feature works end-to-end across services with tests",
    expectedMinutes: 30,
  },
];

/**
 * Load existing results from disk, or return a fresh structure.
 * @returns {{ runs: Array<Object>, lastUpdated: string | null }}
 */
function loadResults() {
  if (fs.existsSync(RESULTS_PATH)) {
    return JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));
  }
  return { runs: [], lastUpdated: null };
}

/**
 * Persist results to disk, creating parent directories as needed.
 * @param {{ runs: Array<Object>, lastUpdated: string | null }} results
 */
function saveResults(results) {
  fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + "\n");
}

/**
 * Record a benchmark run for a given task.
 * @param {string} taskId
 * @param {number} minutes
 * @param {boolean} success
 */
function recordResult(taskId, minutes, success) {
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) {
    const valid = TASKS.map((t) => t.id).join(", ");
    console.error(`Unknown task: ${taskId}. Valid: ${valid}`);
    process.exit(1);
  }

  if (isNaN(minutes) || minutes <= 0) {
    console.error("--minutes must be a positive number");
    process.exit(1);
  }

  const results = loadResults();
  const ratio = minutes / task.expectedMinutes;

  const run = {
    taskId,
    difficulty: task.difficulty,
    minutes,
    success,
    date: new Date().toISOString().split("T")[0],
    ratio: parseFloat(ratio.toFixed(2)),
  };

  const updatedResults = {
    ...results,
    runs: [...results.runs, run],
    lastUpdated: new Date().toISOString(),
  };

  saveResults(updatedResults);

  const indicator = success ? "PASS" : "FAIL";
  console.log(
    `[${indicator}] Recorded: ${taskId} -- ${minutes}min (${ratio.toFixed(1)}x expected)`
  );
}

/**
 * Print the task catalog to stdout.
 */
function printCatalog() {
  console.log("Onboarding Benchmark Tasks");
  console.log("==========================\n");
  for (const task of TASKS) {
    console.log(`[${task.difficulty.toUpperCase()}] ${task.id}`);
    console.log(`  ${task.description}`);
    console.log(`  Measures: ${task.measures}`);
    console.log(`  Expected: ~${task.expectedMinutes} minutes`);
    console.log(`  Success: ${task.successCriteria}\n`);
  }
  console.log(
    "Record a result: node plugins/acmm/scripts/onboarding-benchmark.js --record <task-id> --minutes <N> [--success]"
  );
}

// -- CLI entry point ----------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--record")) {
  const recordIdx = args.indexOf("--record");
  const taskId = args[recordIdx + 1];
  const minutesIdx = args.indexOf("--minutes");
  const minutes = minutesIdx !== -1 ? parseFloat(args[minutesIdx + 1]) : NaN;
  const success = args.includes("--success");

  if (!taskId || isNaN(minutes)) {
    console.error("Usage: --record <task-id> --minutes <N> [--success]");
    process.exit(1);
  }

  recordResult(taskId, minutes, success);
} else {
  printCatalog();
}
