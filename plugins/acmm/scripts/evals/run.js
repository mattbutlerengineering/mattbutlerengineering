/**
 * Eval runner — invokes the agent against one task fixture and returns a
 * scored result. Pluggable via dependency injection so tests can supply a
 * fake runner without spawning subprocesses.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { scoreRun } from "./score.js";

/**
 * @typedef {Object} RunnerOutput
 * @property {import("./score.js").SessionOutcome} outcome
 * @property {number} [costUsd]
 * @property {number} [numTurns]
 *
 * @typedef {Object} RunOpts
 * @property {(task: import("./schema.js").TaskFixture, opts: RunOpts) => Promise<RunnerOutput>} [runner]
 * @property {string} [repoPath]    Where to invoke the agent (default: process.cwd())
 * @property {boolean} [dryRun]     If true, use a no-op runner that returns a synthetic outcome
 */

/**
 * Run one eval task and produce a result line for the JSONL log.
 * @param {import("./schema.js").TaskFixture} task
 * @param {RunOpts} [opts]
 * @returns {Promise<import("./schema.js").EvalResult>}
 */
export async function runEval(task, opts = {}) {
  const runner = opts.runner ?? (opts.dryRun ? dryRunRunner : defaultRunner);
  const t0 = Date.now();

  /** @type {import("./score.js").SessionOutcome} */
  let outcome = {
    completed: false,
    verification: "skip",
    diffSize: 0,
    touchedFiles: [],
    calledTools: [],
  };
  /** @type {number | undefined} */
  let costUsd;
  /** @type {number | undefined} */
  let numTurns;
  /** @type {string | undefined} */
  let error;

  try {
    const r = await runner(task, opts);
    outcome = r.outcome;
    costUsd = r.costUsd;
    numTurns = r.numTurns;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const { score, success, breakdown } = scoreRun(task, outcome);

  /** @type {import("./schema.js").EvalResult} */
  const result = {
    timestamp: new Date().toISOString(),
    taskId: task.id,
    model: task.model,
    success,
    score,
    breakdown,
    durationMs: Date.now() - t0,
  };
  if (typeof costUsd === "number") result.costUsd = costUsd;
  if (typeof numTurns === "number") result.numTurns = numTurns;
  if (error) result.error = error;
  return result;
}

/**
 * Synthetic runner for `--dry-run` and tests. Returns a deterministic outcome
 * derived from the task ID hash so dry runs across the suite produce a mix of
 * pass/fail rather than all-pass or all-fail.
 *
 * @param {import("./schema.js").TaskFixture} task
 * @returns {Promise<RunnerOutput>}
 */
export async function dryRunRunner(task) {
  const h = hash(task.id);
  const willPass = h % 4 !== 0; // ~75% synthetic pass rate
  return {
    outcome: {
      completed: true,
      verification: willPass ? "pass" : "fail",
      diffSize: willPass ? Math.min(task.rubric.diffSizeMax, 3) : task.rubric.diffSizeMax + 5,
      touchedFiles: willPass ? [...task.rubric.mustTouch] : [],
      calledTools: willPass ? [...(task.rubric.mustCall || [])] : [],
    },
    costUsd: 0,
    numTurns: 0,
  };
}

/**
 * Default runner: spawns `mbe agent run --no-pr` and parses stdout.
 * Exit code is unreliable when spawned, so we parse the "Status:" line.
 *
 * @param {import("./schema.js").TaskFixture} task
 * @param {RunOpts} opts
 * @returns {Promise<RunnerOutput>}
 */
export async function defaultRunner(task, opts = {}) {
  const repoPath = opts.repoPath ?? process.cwd();
  if (!existsSync(repoPath)) throw new Error(`repoPath does not exist: ${repoPath}`);

  const cli = `${repoPath}/tools/cli/dist/index.js`;
  const args = [
    "agent",
    "run",
    task.prompt,
    "--no-pr",
    "--verbose",
    "--model",
    task.model,
    "--max-budget",
    String(task.maxBudgetUsd),
    "--max-turns",
    String(task.maxTurns),
  ];

  const TIMEOUT_MS = 600000; // 10 min (increased from 5)
  const MAX_ATTEMPTS = 3;
  let lastResult;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { stdout, stderr, status } = await new Promise((resolve) => {
      const proc = spawn("node", [cli, ...args], {
        cwd: repoPath,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "",
        stderr = "";
      proc.stdout?.on("data", (d) => {
        stdout += d;
      });
      proc.stderr?.on("data", (d) => {
        stderr += d;
      });

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({ stdout, stderr, status: -1 });
      }, TIMEOUT_MS);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, status: code ?? -1 });
      });
    });

    lastResult = { stdout, stderr, status };
    const succeeded = /Status:\s+✓ succeeded/.test(stdout);

    if (succeeded) break;

    const isRateLimit =
      /You've hit your limit/.test(stdout) || /You've hit your limit/.test(stderr);
    if (isRateLimit && attempt < MAX_ATTEMPTS) {
      const waitTime = attempt * 60000; // 1 min, 2 min...
      console.log(
        `  Rate limit hit. Attempt ${attempt}/${MAX_ATTEMPTS} failed. Waiting ${waitTime / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, waitTime));
      continue;
    }

    // If not a rate limit or we're out of attempts, fail
    if (!succeeded) {
      const snippet = stdout.slice(-800) || stderr.slice(-400);
      throw new Error(`agent failed (exit ${status}): ${snippet}`);
    }
  }

  const { stdout } = lastResult;

  // Extract worktree path and measure diff
  const worktreeMatch = stdout.match(/Branch:\s+(\S+)/);
  const worktreePath = worktreeMatch ? `${repoPath}/../${worktreeMatch[1]}` : null;

  // Extract tool calls from verbose output
  // Matches "Tool: name" or "Calling tool: name"
  const toolMatches = stdout.matchAll(/(?:Tool|Calling tool):\s+(\w+)/g);
  const calledTools = [...new Set([...toolMatches].map((m) => m[1]))];

  const outcome = {
    completed: true,
    verification: "pass",
    diffSize: worktreePath && existsSync(worktreePath) ? countDiffLines(worktreePath) : 0,
    touchedFiles: worktreePath && existsSync(worktreePath) ? listChangedFiles(worktreePath) : [],
    calledTools,
  };

  return { outcome, costUsd: undefined, numTurns: undefined };
}

function countDiffLines(worktreePath) {
  try {
    const { execFileSync } = require("node:child_process");
    const out = execFileSync("git", ["-C", worktreePath, "diff", "--shortstat", "HEAD"], {
      encoding: "utf-8",
    });
    const ins = out.match(/(\d+) insertion/),
      del = out.match(/(\d+) deletion/);
    return (ins ? Number(ins[1]) : 0) + (del ? Number(del[1]) : 0);
  } catch {
    return 0;
  }
}

function listChangedFiles(worktreePath) {
  try {
    const { execFileSync } = require("node:child_process");
    const out = execFileSync("git", ["-C", worktreePath, "diff", "--name-only", "HEAD"], {
      encoding: "utf-8",
    });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Tiny non-cryptographic hash for deterministic dry-run distribution.
 * @param {string} s
 * @returns {number}
 */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
