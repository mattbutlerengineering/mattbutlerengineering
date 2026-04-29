/**
 * Eval runner — invokes the agent against one task fixture and returns a
 * scored result. Pluggable via dependency injection so tests can supply a
 * fake runner without spawning subprocesses.
 *
 * The default runner (when implemented) shells out to `mbe agent run
 * --no-pr -v ...` and parses the resulting worktree diff.
 */

import { execFileSync, spawnSync } from "node:child_process";
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
  let outcome = { completed: false, verification: "skip", diffSize: 0, touchedFiles: [] };
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
    },
    costUsd: 0,
    numTurns: 0,
  };
}

/**
 * Default runner: spawns `mbe agent run --no-pr -v` and parses the resulting
 * worktree diff. Not exercised in CI (would burn API budget); tests use
 * `dryRunRunner` or an injected fake.
 *
 * @param {import("./schema.js").TaskFixture} task
 * @param {RunOpts} opts
 * @returns {Promise<RunnerOutput>}
 */
export async function defaultRunner(task, opts = {}) {
  const repoPath = opts.repoPath ?? process.cwd();
  if (!existsSync(repoPath)) throw new Error(`repoPath does not exist: ${repoPath}`);

  // mbe CLI lives in tools/cli; invoke via its build output if present, else tsx
  const cliEntry = `${repoPath}/tools/cli/dist/index.js`;
  const cliArgs = [
    "agent",
    "run",
    task.prompt,
    "--no-pr",
    "--model", task.model,
    "--max-budget", String(task.maxBudgetUsd),
    "--max-turns", String(task.maxTurns),
  ];

  const result = spawnSync("node", [cliEntry, ...cliArgs], {
    cwd: repoPath,
    encoding: "utf-8",
    env: { ...process.env, MBE_AGENT_JSON_OUTPUT: "1" },
  });

  if (result.status !== 0) {
    throw new Error(`agent exited ${result.status}: ${result.stderr.slice(0, 500)}`);
  }

  // The CLI prints a final JSON line with the session result when MBE_AGENT_JSON_OUTPUT=1.
  // (Hook for future implementation; falls back to parsing stdout if absent.)
  const cliResult = parseFinalJsonLine(result.stdout);

  // Inspect the worktree the CLI created. The CLI prints its absolute path
  // to stdout as `worktree: /abs/path` — we fish it out then run git diff.
  const worktreeMatch = result.stdout.match(/worktree:\s*(\S+)/);
  const worktreePath = worktreeMatch ? worktreeMatch[1] : null;

  /** @type {import("./score.js").SessionOutcome} */
  let outcome;
  if (worktreePath && existsSync(worktreePath)) {
    outcome = {
      completed: cliResult?.completed ?? true,
      verification: cliResult?.verification ?? "skip",
      diffSize: countDiffLines(worktreePath),
      touchedFiles: listChangedFiles(worktreePath),
    };
  } else {
    outcome = { completed: false, verification: "skip", diffSize: 0, touchedFiles: [] };
  }

  return {
    outcome,
    costUsd: cliResult?.costUsd,
    numTurns: cliResult?.numTurns,
  };
}

/**
 * @param {string} stdout
 * @returns {{ completed?: boolean, verification?: "pass"|"fail"|"skip", costUsd?: number, numTurns?: number } | null}
 */
function parseFinalJsonLine(stdout) {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) {
      try { return JSON.parse(line); } catch { /* keep scanning */ }
    }
  }
  return null;
}

/**
 * @param {string} worktreePath
 * @returns {number}
 */
function countDiffLines(worktreePath) {
  try {
    const out = execFileSync("git", ["-C", worktreePath, "diff", "--shortstat", "HEAD"], { encoding: "utf-8" });
    // " 2 files changed, 5 insertions(+), 1 deletion(-)"
    const ins = out.match(/(\d+) insertion/);
    const del = out.match(/(\d+) deletion/);
    return (ins ? Number(ins[1]) : 0) + (del ? Number(del[1]) : 0);
  } catch {
    return 0;
  }
}

/**
 * @param {string} worktreePath
 * @returns {string[]}
 */
function listChangedFiles(worktreePath) {
  try {
    const out = execFileSync("git", ["-C", worktreePath, "diff", "--name-only", "HEAD"], { encoding: "utf-8" });
    return out.trim().split("\n").filter((l) => l.length > 0);
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
