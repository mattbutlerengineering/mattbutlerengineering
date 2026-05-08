#!/usr/bin/env node

/**
 * Log agent session cost for spend tracking.
 *
 * Appends a JSON-lines entry to .claude/agent-spend.jsonl with cost,
 * issue number, and timestamp. The progress tracker aggregates these
 * to compute daily spend and flag threshold breaches.
 *
 * Usage: node scripts/log-agent-cost.js --cost 0.45 --issue 199 [--model claude-sonnet-4-6]
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const LOG_PATH = join(root, ".claude", "agent-spend.jsonl");
const DAILY_THRESHOLD_USD = parseFloat(process.env.AGENT_DAILY_SPEND_LIMIT ?? "10");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--cost" && argv[i + 1]) {
      args.cost = parseFloat(argv[i + 1]);
      i++;
    } else if (argv[i] === "--issue" && argv[i + 1]) {
      args.issue = parseInt(argv[i + 1], 10);
      i++;
    } else if (argv[i] === "--model" && argv[i + 1]) {
      args.model = argv[i + 1];
      i++;
    }
  }
  return args;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getDailySpend() {
  if (!existsSync(LOG_PATH)) return 0;
  const today = todayKey();
  let total = 0;
  for (const line of readFileSync(LOG_PATH, "utf-8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.date === today) {
        total += entry.costUsd ?? 0;
      }
    } catch {
      // skip malformed lines
    }
  }
  return total;
}

// CLI runner
const args = parseArgs(process.argv);

if (args.cost === undefined || args.cost === null) {
  console.log("Usage: node scripts/log-agent-cost.js --cost <usd> --issue <number> [--model <id>]");
  process.exit(1);
}

// Ensure .claude directory exists
const logDir = dirname(LOG_PATH);
if (!existsSync(logDir)) {
  mkdirSync(logDir, { recursive: true });
}

const entry = {
  date: todayKey(),
  timestamp: new Date().toISOString(),
  costUsd: args.cost,
  issueNumber: args.issue ?? null,
  model: args.model ?? null,
};

appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");

const dailySpend = getDailySpend();
console.log(`Logged: $${args.cost.toFixed(4)} for issue #${args.issue ?? "unknown"}`);
console.log(`Daily spend: $${dailySpend.toFixed(4)} / $${DAILY_THRESHOLD_USD.toFixed(2)} limit`);

if (dailySpend >= DAILY_THRESHOLD_USD) {
  console.log(
    `\n⚠️  ALERT: Daily spend ($${dailySpend.toFixed(2)}) exceeds threshold ($${DAILY_THRESHOLD_USD.toFixed(2)})`
  );
  process.exit(2); // Exit code 2 = threshold exceeded (not a script error)
}
