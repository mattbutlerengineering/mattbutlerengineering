import { Command } from "commander";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import {
  runSession,
  runEvalSuite,
  loadSuite,
  calibrate,
  resolveSuitePath,
  checkCostRegression,
  suiteDidNotRun,
  DEFAULT_SESSION_CONFIG,
  DEFAULT_FEEDBACK_LOOP_CONFIG,
  type SessionConfig,
  type Task,
  type TaskRunner,
  type TaskRunResult,
  type DeterministicChecks,
  type EvalReport,
  type CalibrationSummary,
} from "@mbe/agent-core";
import { findMonorepoRoot } from "../monorepo-root.js";

const execFileAsync = promisify(execFile);

// Distinct from the exit code the `--threshold`/`--max-cost-regression` gates
// use (1) — a caller must be able to tell "the suite genuinely regressed"
// apart from "the agent never ran" (no credentials / missing prerequisite).
const NO_RUN_EXIT_CODE = 2;

/**
 * `mbe agent eval` — run the golden-task suite through the agent and score it.
 *
 * The agent invocation + post-run verification (the {@link TaskRunner}) is the
 * integration seam: it runs the real `runSession` and executes the fixture's
 * verify scripts. The scoring/aggregation core it feeds is unit-tested in
 * @mbe/agent-core.
 */
export const agentEvalCommand = new Command("eval")
  .description("Run the golden-task eval suite through the agent and score the results")
  .option("--suite <dir>", "Suite directory", "packages/agent-core/eval-suite")
  .option("--task <id>", "Run only the task with this id")
  .option("-m, --model <model>", "Model to run the agent with", DEFAULT_SESSION_CONFIG.model)
  .option("--json", "Emit the EvalReport as JSON", false)
  .option("--threshold <pct>", "Exit non-zero if suite pass rate is below this percent")
  .option(
    "--max-cost-regression <pct>",
    "Exit non-zero if mean cost-per-task exceeds the latest baseline by more than this percent"
  )
  .option("--calibrate", "Print self-grade vs ground-truth calibration summary", false)
  .action(
    async (options: {
      suite: string;
      task?: string;
      model: string;
      json: boolean;
      threshold?: string;
      maxCostRegression?: string;
      calibrate: boolean;
    }) => {
      const repoPath = resolve(process.cwd());
      const suiteDir = resolve(repoPath, resolveSuitePath(options.suite));

      let tasks: Task[];
      try {
        tasks = await loadSuite(suiteDir);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
        return;
      }

      // Read baseline before appending the current run so the most recent prior
      // entry is used, not the one we're about to write.
      const costBaseline =
        options.maxCostRegression !== undefined ? loadCostBaseline(findLogFile()) : null;

      const runTask = makeAgentTaskRunner(repoPath, options.model);
      const report = await runEvalSuite(tasks, {
        runId: `eval-${process.pid}`,
        only: options.task,
        runTask,
      });

      if (suiteDidNotRun(report)) {
        emitReport(report, options.json);
        console.error(`\n${noRunMessage()}`);
        process.exitCode = NO_RUN_EXIT_CODE;
        return;
      }

      persistReport(report);
      emitReport(report, options.json);

      if (options.calibrate) {
        printCalibration(calibrate(report));
      }

      if (options.threshold !== undefined) {
        const threshold = Number(options.threshold) / 100;
        if (report.aggregate.passRate < threshold) {
          console.error(
            `\nPass rate ${(report.aggregate.passRate * 100).toFixed(1)}% is below threshold ${options.threshold}%`
          );
          process.exitCode = 1;
        }
      }

      if (options.maxCostRegression !== undefined) {
        const thresholdPct = Number(options.maxCostRegression);
        const current = report.aggregate.meanCostUsd;
        if (!checkCostRegression(current, costBaseline, thresholdPct)) {
          const pctIncrease = (((current - costBaseline!) / costBaseline!) * 100).toFixed(1);
          console.error(
            `\nCost regression detected: mean cost $${current.toFixed(4)} is ${pctIncrease}% above baseline $${costBaseline!.toFixed(4)} (threshold ${options.maxCostRegression}%)`
          );
          process.exitCode = 1;
        }
      }
    }
  );

/** Prints the report as JSON or the human-readable table, per `--json`. */
function emitReport(report: EvalReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

/**
 * Names the most likely missing prerequisite for a suite where every task
 * reported 0 turns / $0 cost — the agent adapter never actually ran.
 */
function noRunMessage(): string {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    return "No task executed: ANTHROPIC_API_KEY is not set, so the agent adapter has no credentials to run. This is not a scored regression — the suite never ran.";
  }
  return "No task executed: every task reported 0 turns and $0.00 cost. This is not a scored regression — the suite never ran.";
}

function findLogFile(): string {
  const root = findMonorepoRoot(process.cwd());
  return join(root, "metrics", "eval-reports.jsonl");
}

/**
 * Reads the most recent entry from eval-reports.jsonl and returns its
 * meanCostUsd, or null when the file is absent, empty, or unparseable.
 */
function loadCostBaseline(logFile: string): number | null {
  try {
    const content = readFileSync(logFile, "utf8");
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1];
    if (last === undefined) return null;
    const parsed = JSON.parse(last) as { aggregate?: { meanCostUsd?: unknown } };
    const cost = parsed?.aggregate?.meanCostUsd;
    return typeof cost === "number" ? cost : null;
  } catch {
    return null;
  }
}

/**
 * Appends the report to a JSONL file in metrics/ — mirrors the `mbe stats` record pattern.
 * Each line is a complete {@link EvalReport} enriched with a timestamp.
 */
function persistReport(report: EvalReport): void {
  const root = findMonorepoRoot(process.cwd());
  const logDir = join(root, "metrics");
  const logFile = join(logDir, "eval-reports.jsonl");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const record = { ...report, timestamp: new Date().toISOString() };
  appendFileSync(logFile, JSON.stringify(record) + "\n");
}

/** Builds the live runner: run the agent on a task, then verify its branch. */
function makeAgentTaskRunner(repoPath: string, model: string): TaskRunner {
  return async (task: Task): Promise<TaskRunResult> => {
    const config: SessionConfig = {
      taskDescription: task.prompt,
      repoPath,
      baseBranch: DEFAULT_SESSION_CONFIG.baseBranch,
      model,
      maxTurns: task.budget.maxTurns,
      maxBudgetUsd: task.budget.maxCostUsd,
      allowedTools: [...DEFAULT_SESSION_CONFIG.allowedTools],
      createPr: false,
      feedbackLoop: DEFAULT_FEEDBACK_LOOP_CONFIG,
    };

    const session = await runSession(config, () => {});

    const withinBudget =
      session.costUsd <= task.budget.maxCostUsd && session.numTurns <= task.budget.maxTurns;

    const checks: DeterministicChecks = {
      withinBudget,
      testsPass: task.rubric.testsMustPass
        ? await verify(repoPath, session.branchName, task.fixtureRef, "test")
        : true,
      typecheckPass: task.rubric.typecheckMustPass
        ? await verify(repoPath, session.branchName, task.fixtureRef, "typecheck")
        : true,
      lintPass: task.rubric.lintMustPass
        ? await verify(repoPath, session.branchName, task.fixtureRef, "lint")
        : true,
    };

    return { task, session, checks };
  };
}

/**
 * Runs a pnpm script for the fixture's package on the agent's produced branch.
 * Conservative: any failure (including an inability to run) scores as `false`.
 */
async function verify(
  repoPath: string,
  branch: string,
  fixtureRef: string,
  script: "test" | "typecheck" | "lint"
): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", repoPath, "checkout", branch], { timeout: 30_000 });
    await execFileAsync("pnpm", ["--filter", `./${fixtureRef}`, script], {
      cwd: repoPath,
      timeout: 300_000,
    });
    return true;
  } catch {
    return false;
  }
}

function printCalibration(summary: CalibrationSummary): void {
  console.log("");
  console.log("Calibration Summary (self-grade vs ground-truth)");
  console.log("─────────────────────────────────────────────────");

  const fmtBucket = (label: string, b: { count: number; passRate: number }): void => {
    if (b.count === 0) {
      console.log(`  ${label}: no tasks`);
    } else {
      console.log(
        `  ${label}: ${b.count} task${b.count === 1 ? "" : "s"}, actual pass rate ${(b.passRate * 100).toFixed(1)}%`
      );
    }
  };

  fmtBucket("High confidence (>=70%)", summary.high);
  fmtBucket("Med  confidence (40-69%)", summary.medium);
  fmtBucket("Low  confidence (<40%)", summary.low);
  console.log(`  Tasks with self-eval: ${summary.totalWithSelfEval}`);
  if (summary.totalWithoutSelfEval > 0) {
    console.log(`  Tasks without self-eval (excluded): ${summary.totalWithoutSelfEval}`);
  }
}

function printReport(report: EvalReport): void {
  const a = report.aggregate;
  console.log("Eval Report");
  console.log("───────────");
  for (const t of report.tasks) {
    const mark = t.passed ? "✓" : "✗";
    const detail = t.error ? `error: ${t.error}` : `score ${(t.score * 100).toFixed(0)}%`;
    console.log(
      `${mark} ${t.taskId} [${t.category}] — ${detail} (${t.turns} turns, $${t.costUsd.toFixed(2)})`
    );
  }
  console.log("");
  console.log(`Tasks:       ${a.total}`);
  console.log(`Pass rate:   ${(a.passRate * 100).toFixed(1)}%`);
  console.log(`Mean score:  ${(a.meanScore * 100).toFixed(1)}%`);
  console.log(`Mean cost:   $${a.meanCostUsd.toFixed(2)}`);
  console.log(`Mean turns:  ${a.meanTurns.toFixed(1)}`);
  const nonRunLine =
    report.nonRunCount > 0
      ? `\nExcluded (did not run): ${report.nonRunCount} — not counted in the aggregate above`
      : "";
  console.log(`Failed to complete: ${a.stuckCount}${nonRunLine}`);
}
