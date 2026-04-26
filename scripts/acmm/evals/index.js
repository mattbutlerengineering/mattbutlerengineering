#!/usr/bin/env node

/**
 * ACMM evals runner CLI.
 *
 * Loads task fixtures from `scripts/acmm/evals/tasks/*.json`, runs each
 * against the agent (or a dry-run synthetic), and appends results to
 * `metrics/acmm-evals.jsonl`.
 *
 * Usage:
 *   node scripts/acmm/evals/index.js --dry-run        # exercise the flow without spending API $
 *   node scripts/acmm/evals/index.js --task <id>      # run only this task
 *   node scripts/acmm/evals/index.js --report         # print summary from JSONL, no run
 *   node scripts/acmm/evals/index.js                  # full run (calls real agent)
 *
 * Exit code: 0 on completion regardless of pass/fail (diagnostic, not gating).
 */

import { readFileSync, readdirSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTask } from "./schema.js";
import { runEval } from "./run.js";
import { measureEvals } from "../evals.js";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const REPORT = args.has("--report");
const taskIdx = process.argv.indexOf("--task");
const ONLY_TASK = taskIdx >= 0 ? process.argv[taskIdx + 1] : null;

const cwd = process.cwd();
const __dirname = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(__dirname, "tasks");
const OUT_PATH = join(cwd, "metrics/acmm-evals.jsonl");

if (REPORT) {
  printReport();
  process.exit(0);
}

const tasks = loadTasks();
const filtered = ONLY_TASK ? tasks.filter((t) => t.id === ONLY_TASK) : tasks;

if (filtered.length === 0) {
  console.error(ONLY_TASK ? `no task found with id "${ONLY_TASK}"` : "no task fixtures found");
  process.exit(1);
}

console.log(`ACMM evals: running ${filtered.length} task${filtered.length === 1 ? "" : "s"}${DRY_RUN ? " (dry-run)" : ""}`);
console.log("");

mkdirSync(dirname(OUT_PATH), { recursive: true });

let passes = 0;
let fails = 0;
for (const task of filtered) {
  process.stdout.write(`  ${task.id} ... `);
  const result = await runEval(task, { dryRun: DRY_RUN, repoPath: cwd });
  appendFileSync(OUT_PATH, JSON.stringify(result) + "\n", "utf-8");
  if (result.success) {
    passes++;
    console.log(`✓ ${result.score.toFixed(2)}${result.error ? ` (error: ${result.error.slice(0, 60)})` : ""}`);
  } else {
    fails++;
    console.log(`✗ ${result.score.toFixed(2)}${result.error ? ` (error: ${result.error.slice(0, 60)})` : ""}`);
  }
}

console.log("");
console.log(`done: ${passes}/${filtered.length} passed (${fails} failed)`);
console.log(`results: ${OUT_PATH}`);

if (!DRY_RUN) printReport();

function loadTasks() {
  if (!existsSync(TASKS_DIR)) return [];
  const out = [];
  for (const file of readdirSync(TASKS_DIR)) {
    if (!file.endsWith(".json")) continue;
    const path = join(TASKS_DIR, file);
    try {
      const raw = JSON.parse(readFileSync(path, "utf-8"));
      out.push(parseTask(raw));
    } catch (e) {
      console.error(`skipping malformed task ${file}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return out;
}

function printReport() {
  const summary = measureEvals(cwd);
  console.log("");
  console.log("ACMM evals — last 30 days");
  console.log(`  runs: ${summary.n}`);
  console.log(`  pass rate: ${(summary.passRate * 100).toFixed(0)}%`);
  console.log(`  median score: ${summary.medianScore.toFixed(2)}`);
  if (summary.medianCostUsd !== null) console.log(`  median cost: $${summary.medianCostUsd.toFixed(2)}`);
  if (summary.medianTurns !== null) console.log(`  median turns: ${summary.medianTurns}`);
  console.log(`  status: ${summary.status}`);
  if (Object.keys(summary.perModel).length > 1) {
    console.log("");
    console.log("  by model:");
    for (const [model, m] of Object.entries(summary.perModel)) {
      console.log(`    ${model}: ${(m.passRate * 100).toFixed(0)}% (n=${m.n}, score ${m.medianScore.toFixed(2)})`);
    }
  }
}
