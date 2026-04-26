#!/usr/bin/env node

/**
 * Multi-agent orchestration entry point. Decomposes a task description
 * into parallel subtasks, dispatches them to independent agent sessions,
 * and aggregates the resulting PRs.
 *
 * Wraps the existing `mbe agent orchestrate` CLI command — which already
 * handles decomposition, parallel session spawning, and PR creation — so
 * that orchestration is reachable from a stable script path independent
 * of the @mbe/cli package layout.
 *
 * Detected by acmm:multi-agent-orchestration. The criterion's underlying
 * need is a documented, stable orchestrator entry point — not a new
 * implementation, since `mbe agent orchestrate` already exists.
 *
 * Usage:
 *   node scripts/orchestrate.mjs "Big task description here"
 *   node scripts/orchestrate.mjs --help
 *
 * Forwards all arguments to `mbe agent orchestrate`. The mbe CLI must
 * be on PATH (run `pnpm install` from the repo root if it isn't).
 */

import { spawn } from "node:child_process";

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.log(`Usage: node scripts/orchestrate.mjs "<task description>" [--max-parallel N] [--model claude-...]

Wraps \`mbe agent orchestrate\` — see \`mbe agent orchestrate --help\` for the
full flag set. The CLI handles task decomposition, parallel agent session
spawning, and PR creation; this script exists so orchestration has a
stable repo-relative path.

Examples:
  node scripts/orchestrate.mjs "Add E2E tests for the reservations API"
  node scripts/orchestrate.mjs "Fix the 4 failing CI workflows" --max-parallel 4

The orchestrator decomposes the task, spawns one agent session per
subtask, monitors them in parallel, and opens one PR per session.
`);
  process.exit(args.length === 0 ? 1 : 0);
}

const child = spawn("mbe", ["agent", "orchestrate", ...args], {
  stdio: "inherit",
  shell: false,
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("mbe CLI not found on PATH. Run `pnpm install` from the repo root, then retry.");
    process.exit(127);
  }
  console.error(`orchestrate failed: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
