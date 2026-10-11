import { Command } from "commander";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
import {
  runAgentSession,
  resolveSessionAdapter,
  runEvalSuite,
  loadSuite,
  calibrate,
  removeWorktree,
  resolveSuitePath,
  checkCostRegression,
  suiteDidNotRun,
  costBasisForAdapter,
  isWithinBudget,
  DEFAULT_SESSION_CONFIG,
  DEFAULT_FEEDBACK_LOOP_CONFIG,
  type AdapterType,
  type CostBasis,
  type SessionConfig,
  type SessionResult,
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

// Same backends `mbe agent run --adapter` accepts, resolved through the
// same agent-core seam (#4199) — see adapter-resolution.ts.
const VALID_ADAPTERS: readonly AdapterType[] = [
  "auto",
  "claude",
  "claude-cli",
  "opencode",
  "grok",
  "omp",
];

function isAdapterType(value: string): value is AdapterType {
  return (VALID_ADAPTERS as readonly string[]).includes(value);
}

/**
 * `mbe agent eval` — run the golden-task suite through the agent and score it.
 *
 * The agent invocation + post-run verification (the {@link TaskRunner}) is the
 * integration seam: it resolves an adapter via `resolveSessionAdapter` and
 * runs it through `runAgentSession` — the same seam `mbe agent run` uses
 * (#4199) — then executes the fixture's verify scripts. The
 * scoring/aggregation core it feeds is unit-tested in @mbe/agent-core.
 */
export const agentEvalCommand = new Command("eval")
  .description("Run the golden-task eval suite through the agent and score the results")
  .option("--suite <dir>", "Suite directory", "packages/agent-core/eval-suite")
  .option("--task <id>", "Run only the task with this id")
  .option("-m, --model <model>", "Model to run the agent with", DEFAULT_SESSION_CONFIG.model)
  .option(
    "--adapter <type>",
    "Agent adapter: auto, claude, claude-cli, opencode, grok, omp",
    "claude"
  )
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
      adapter: string;
      json: boolean;
      threshold?: string;
      maxCostRegression?: string;
      calibrate: boolean;
    }) => {
      if (!isAdapterType(options.adapter)) {
        console.error(
          `Invalid adapter: "${options.adapter}". Must be one of: ${VALID_ADAPTERS.join(", ")}`
        );
        process.exitCode = 1;
        return;
      }
      const adapterType = options.adapter;

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

      // Read baseline before appending the current run so the most recent
      // prior entry is used, not the one we're about to write. Scoped to
      // this run's own adapter (#4218 rework) — comparing cost across
      // adapters is meaningless, and a $0 report from one adapter must
      // never silently disable the gate for a different adapter.
      const costBaseline =
        options.maxCostRegression !== undefined
          ? loadCostBaseline(findLogFile(), adapterType)
          : null;

      // Decided once per run: which adapters' reported `costUsd` is billed
      // money, and therefore whether the budget's cost arm applies. Threaded
      // to the runner (scoring) and the persisted row (labelling).
      const costBasis = costBasisForAdapter(adapterType);

      const runTask = makeAgentTaskRunner(repoPath, options.model, adapterType, costBasis);
      const report = await runEvalSuite(tasks, {
        runId: `eval-${process.pid}`,
        only: options.task,
        runTask,
      });

      if (suiteDidNotRun(report)) {
        emitReport(report, options.json, costBasis);
        console.error(`\n${noRunMessage(adapterType, report)}`);
        process.exitCode = NO_RUN_EXIT_CODE;
        return;
      }

      persistReport(report, adapterType, costBasis);
      emitReport(report, options.json, costBasis);

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

/** Prints the report as JSON or the human-readable table, per `--json`. The JSON shape is unchanged. */
function emitReport(report: EvalReport, json: boolean, costBasis: CostBasis): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report, costBasis);
  }
}

const NEVER_RAN = "This is not a scored regression — the suite never ran.";

/**
 * Explains a suite where every task reported 0 turns / $0 cost — the agent
 * adapter produced no usage — claiming only causes it can distinguish.
 *
 * `auto`/`claude` route through the Claude SDK, whose missing
 * `ANTHROPIC_API_KEY` is directly observable, so it is named. For every
 * other adapter the command cannot see why the process produced nothing, so
 * it quotes each session's own error line when any exists (`sessionErrors`)
 * and otherwise, for `claude-cli`, names the binary/login as only the most
 * likely cause — never asserts one it cannot see.
 */
function noRunMessage(adapterType: AdapterType, report: EvalReport): string {
  if ((adapterType === "claude" || adapterType === "auto") && !process.env["ANTHROPIC_API_KEY"]) {
    return `No task executed: ANTHROPIC_API_KEY is not set, so the agent adapter has no credentials to run. ${NEVER_RAN}`;
  }
  const reported = report.tasks
    .filter((t) => t.sessionErrors !== undefined && t.sessionErrors.length > 0)
    .map((t) => `${t.taskId}: ${t.sessionErrors!.join("; ")}`);
  if (adapterType === "claude-cli") {
    const prefix = "No task produced any usage via the claude-cli adapter (0 turns / $0.00)";
    return reported.length > 0
      ? `${prefix}. The sessions reported — ${reported.join("; ")}. ${NEVER_RAN}`
      : `${prefix} and no session reported an error: most likely the "claude" CLI is not on PATH or has no subscription login. ${NEVER_RAN}`;
  }
  const base = `No task executed: every task reported 0 turns and $0.00 cost via the "${adapterType}" adapter. ${NEVER_RAN}`;
  return reported.length > 0 ? `${base} The sessions reported — ${reported.join("; ")}` : base;
}

// Printed under a non-billed basis only, so a $1.37 task beside a $0.50
// budget in the routine's log does not read as a scoring bug.
const NON_BILLED_COST_BASIS_NOTE: Record<Exclude<CostBasis, "billed">, string> = {
  "api-equivalent": "CLI-reported, not billed; budget cost arm not applied",
  none: "adapter reports no cost figure; budget cost arm not applied",
};

function findLogFile(): string {
  const root = findMonorepoRoot(process.cwd());
  return join(root, "metrics", "eval-reports.jsonl");
}

/**
 * Reads the most recent entry from eval-reports.jsonl *tagged with the given
 * adapter* and returns its meanCostUsd, or null when no such entry exists
 * (file absent/empty, no line for this adapter, or that line's cost is
 * unparseable).
 *
 * Scoped by adapter (#4218 rework): comparing cost across adapters is
 * meaningless regardless of value. An unscoped "last entry in the file"
 * read let one adapter's $0 report silently become any other adapter's
 * baseline, permanently short-circuiting `checkCostRegression`'s
 * `baseline === 0` case regardless of how far that other adapter's real
 * spend moved. A line with no `adapter` field at all (a pre-#4218 legacy
 * row) is never treated as a match for any adapter — the safe direction is
 * "no baseline", not "assume it matches".
 */
function loadCostBaseline(logFile: string, adapterType: AdapterType): number | null {
  let lines: string[];
  try {
    lines = readFileSync(logFile, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null;
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line === undefined) continue;
    try {
      const parsed = JSON.parse(line) as {
        adapter?: unknown;
        aggregate?: { meanCostUsd?: unknown };
      };
      if (parsed.adapter !== adapterType) continue;
      const cost = parsed.aggregate?.meanCostUsd;
      return typeof cost === "number" ? cost : null;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Appends the report to a JSONL file in metrics/ — mirrors the `mbe stats` record pattern.
 * Each line is a complete {@link EvalReport} enriched with a timestamp, the
 * adapter it ran under (see {@link loadCostBaseline}), and that adapter's
 * cost basis — so a reader knows whether a task's `costUsd` is billed money
 * without consulting code. Basis is a function of adapter, not task, so it
 * lives at the row level beside `adapter`.
 */
function persistReport(report: EvalReport, adapterType: AdapterType, costBasis: CostBasis): void {
  const root = findMonorepoRoot(process.cwd());
  const logDir = join(root, "metrics");
  const logFile = join(logDir, "eval-reports.jsonl");
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
  const record = {
    ...report,
    timestamp: new Date().toISOString(),
    adapter: adapterType,
    costBasis,
  };
  appendFileSync(logFile, JSON.stringify(record) + "\n");
}

/**
 * Builds the live runner: run the agent (via the resolved adapter) on a
 * task, then verify its change inside the session's kept worktree
 * ({@link verifyInWorktree}).
 *
 * A persisted $0 report is a real baseline for that adapter only.
 * `loadCostBaseline`/`persistReport` (#4218 rework) tag every persisted
 * report with its adapter and only match same-adapter baselines, so one
 * adapter's $0 row cannot silence another's cost gate. A session that
 * reports `{ costUsd: 0, numTurns: 0 }` is still a non-run
 * (`taskDidNotRun` / `suiteDidNotRun`).
 *
 * `costBasis` (from `costBasisForAdapter`) decides whether the budget's cost
 * arm applies at all: `claude-cli` reports a real API-equivalent figure that
 * is not billed under a subscription login — and is inflated on turn 1 by
 * the repo's cached CLAUDE.md/rules context past every task's `maxCostUsd` —
 * so only the turns arm bounds it. The reported figure is still recorded.
 */
function makeAgentTaskRunner(
  repoPath: string,
  model: string,
  adapterType: AdapterType,
  costBasis: CostBasis
): TaskRunner {
  const adapter = resolveSessionAdapter(adapterType);

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

    const session = await runAgentSession(config, { adapter, onEvent: () => {} });

    const checks: DeterministicChecks = {
      withinBudget: isWithinBudget(session, task.budget, costBasis),
      ...(await verifyInWorktree(task, session)),
    };

    await releaseWorktree(repoPath, task.id, session);

    return { task, session, checks };
  };
}

type FixtureScript = "test" | "typecheck" | "lint";

/** A cold monorepo install can exceed the 60 s `syncLockfileIfNeeded` uses. */
const INSTALL_TIMEOUT_MS = 300_000;
/**
 * Per script, through turbo: the first one also builds the fixture's
 * workspace deps (`^build` + `db:generate`, ~68 s measured cold for
 * services/reservations); later ones hit the worktree's own turbo cache.
 */
const SCRIPT_TIMEOUT_MS = 600_000;
const OUTPUT_TAIL_LINES = 20;

/**
 * Eval fixture verifier: runs the rubric's fixture scripts inside the
 * session's kept worktree — never a `git checkout` in the caller's repo,
 * which git refuses while the worktree holds the branch and which would
 * switch the caller's own checkout if it didn't.
 *
 * One `pnpm install --frozen-lockfile` per task, then each required script
 * through turbo so the task graph's `^build` builds the workspace deps a
 * fresh worktree has no `dist/` for (G1). Conservative: any failure —
 * including an inability to run, or no worktree at all — scores `false`,
 * never throws, and says why on stderr. The row does not distinguish a
 * harness-caused `false` from an agent-caused one.
 */
async function verifyInWorktree(
  task: Task,
  session: SessionResult
): Promise<Omit<DeterministicChecks, "withinBudget">> {
  const { rubric, fixtureRef } = task;
  const required: Readonly<Record<FixtureScript, boolean>> = {
    test: rubric.testsMustPass,
    typecheck: rubric.typecheckMustPass,
    lint: rubric.lintMustPass,
  };
  const anyRequired = Object.values(required).some(Boolean);
  const worktreePath = session.worktreePath;

  if (anyRequired && worktreePath === undefined) {
    const errors = session.errors.length > 0 ? session.errors.join("; ") : "none reported";
    console.error(
      `${task.id}: no worktree to verify in (session ${session.status}; errors: ${errors}) — every rubric check scored false`
    );
  }

  const installed =
    anyRequired && worktreePath !== undefined
      ? await runStep(
          task.id,
          "install",
          worktreePath,
          ["install", "--frozen-lockfile"],
          INSTALL_TIMEOUT_MS
        )
      : false;

  const check = async (script: FixtureScript): Promise<boolean> => {
    if (!required[script]) return true;
    if (!installed || worktreePath === undefined) return false;
    return runStep(
      task.id,
      script,
      worktreePath,
      ["turbo", "run", script, `--filter=./${fixtureRef}`, "--output-logs=errors-only"],
      SCRIPT_TIMEOUT_MS
    );
  };

  return {
    testsPass: await check("test"),
    typecheckPass: await check("typecheck"),
    lintPass: await check("lint"),
  };
}

/** Runs one `pnpm` step in the worktree; `false` (plus a stderr line) on any failure. */
async function runStep(
  taskId: string,
  step: string,
  worktreePath: string,
  args: readonly string[],
  timeout: number
): Promise<boolean> {
  try {
    await execFileAsync("pnpm", [...args], { cwd: worktreePath, timeout });
    return true;
  } catch (err) {
    console.error(`${taskId}: ${step} failed in ${worktreePath} — ${outputTail(err)}`);
    return false;
  }
}

function outputTail(err: unknown): string {
  const e = err as { stdout?: unknown; stderr?: unknown; message?: unknown };
  const output = [e.stdout, e.stderr]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join("\n");
  const text = output !== "" ? output : String(e.message ?? err);
  return text.trimEnd().split("\n").slice(-OUTPUT_TAIL_LINES).join("\n");
}

/**
 * A succeeded session's worktree is removed (best-effort — the `agent/*`
 * branch ref is kept, so `git show` still has the diff); any other session's
 * is kept for inspection and its path printed.
 */
async function releaseWorktree(
  repoPath: string,
  taskId: string,
  session: SessionResult
): Promise<void> {
  const worktreePath = session.worktreePath;
  if (worktreePath === undefined) return;
  if (session.status !== "succeeded") {
    console.error(`${taskId}: worktree kept for inspection at ${worktreePath}`);
    return;
  }
  try {
    // Bounded at 60 s by agent-core's own git timeout.
    await removeWorktree(repoPath, worktreePath);
  } catch {
    // Best-effort: a leftover worktree is litter, not a scoring error.
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

function printReport(report: EvalReport, costBasis: CostBasis): void {
  const a = report.aggregate;
  console.log("Eval Report");
  console.log("───────────");
  for (const t of report.tasks) {
    const mark = t.passed ? "✓" : "✗";
    const detail = t.error ? `error: ${t.error}` : `score ${(t.score * 100).toFixed(0)}%`;
    console.log(
      `${mark} ${t.taskId} [${t.category}] — ${detail} (${t.turns} turns, $${t.costUsd.toFixed(2)})`
    );
    if (t.sessionErrors && t.sessionErrors.length > 0) {
      console.log(`    session errors: ${t.sessionErrors.join("; ")}`);
    }
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
  if (costBasis !== "billed") {
    console.log(`\nCost basis: ${costBasis} — ${NON_BILLED_COST_BASIS_NOTE[costBasis]}`);
  }
}
