#!/usr/bin/env node

/**
 * ACMM Onboarding Benchmark
 *
 * Measures how quickly a fresh AI session can complete known tasks.
 * Run manually by starting a new AI session and timing the tasks below.
 *
 * Usage: node scripts/acmm/onboarding-bench.js [--list | --record <task-id> <turns> <seconds>]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_PATH = join(__dirname, "../../.claude/acmm/onboarding-results.json");

const BENCHMARK_TASKS = [
  {
    id: "health-endpoint",
    name: "Add a health endpoint",
    description:
      'Add a GET /health endpoint to an existing Fastify service that returns { status: "ok", timestamp: Date.now() }',
    targetPackage: "services/users",
    expectedTurns: 5,
    expectedSeconds: 120,
    difficulty: "easy",
  },
  {
    id: "add-test",
    name: "Add a unit test",
    description:
      "Write a unit test for an existing utility function, achieving >80% branch coverage",
    targetPackage: "packages/config",
    expectedTurns: 8,
    expectedSeconds: 180,
    difficulty: "easy",
  },
  {
    id: "fix-type-error",
    name: "Fix a type error",
    description:
      "Identify and fix a TypeScript strict-mode error introduced by enabling noUncheckedIndexedAccess",
    targetPackage: "packages/rialto",
    expectedTurns: 6,
    expectedSeconds: 150,
    difficulty: "medium",
  },
  {
    id: "add-component",
    name: "Create a Rialto component",
    description:
      "Create a new Badge component following Rialto patterns (CSS Modules, forwardRef, tokens, accessibility test)",
    targetPackage: "packages/rialto",
    expectedTurns: 15,
    expectedSeconds: 300,
    difficulty: "medium",
  },
  {
    id: "cross-package-feature",
    name: "Cross-package feature",
    description:
      "Add a new API endpoint in services/users AND consume it from apps/hospitality with proper typing",
    targetPackage: "services/users + apps/hospitality",
    expectedTurns: 25,
    expectedSeconds: 600,
    difficulty: "hard",
  },
];

function listTasks() {
  console.log("ACMM Onboarding Benchmark Tasks\n");
  console.log("Run each task in a fresh AI session and record turns + time.\n");
  for (const task of BENCHMARK_TASKS) {
    console.log(`  ${task.id} (${task.difficulty})`);
    console.log(`    ${task.name}`);
    console.log(`    ${task.description}`);
    console.log(`    Target: ${task.targetPackage}`);
    console.log(`    Expected: ${task.expectedTurns} turns, ${task.expectedSeconds}s`);
    console.log("");
  }
}

function recordResult(taskId, turns, seconds) {
  const task = BENCHMARK_TASKS.find((t) => t.id === taskId);
  if (!task) {
    console.error(`Unknown task: ${taskId}. Run --list to see available tasks.`);
    process.exit(1);
  }

  const results = existsSync(RESULTS_PATH)
    ? JSON.parse(readFileSync(RESULTS_PATH, "utf8"))
    : { benchmarks: [] };

  const result = {
    taskId,
    turns: Number(turns),
    seconds: Number(seconds),
    date: new Date().toISOString(),
    turnsVsExpected: (Number(turns) / task.expectedTurns).toFixed(2),
    timeVsExpected: (Number(seconds) / task.expectedSeconds).toFixed(2),
  };

  results.benchmarks.push(result);
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2) + "\n");

  const turnsScore = Number(result.turnsVsExpected) <= 1.0 ? "PASS" : "OVER";
  const timeScore = Number(result.timeVsExpected) <= 1.0 ? "PASS" : "OVER";

  console.log(`Recorded: ${taskId}`);
  console.log(`  Turns: ${turns} (${turnsScore} — ${result.turnsVsExpected}x expected)`);
  console.log(`  Time: ${seconds}s (${timeScore} — ${result.timeVsExpected}x expected)`);
}

const args = process.argv.slice(2);
if (args[0] === "--list" || args.length === 0) {
  listTasks();
} else if (args[0] === "--record" && args.length === 4) {
  recordResult(args[1], args[2], args[3]);
} else {
  console.log("Usage:");
  console.log("  node scripts/acmm/onboarding-bench.js --list");
  console.log("  node scripts/acmm/onboarding-bench.js --record <task-id> <turns> <seconds>");
}
