import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { decideRedConfirmation, main, MAX_CONFIRMATION_RERUNS } from "../confirm-red.mjs";
import { resolveRevertAction } from "../revert-watchdog.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW = loadYaml(
  readFileSync(resolve(ROOT, ".github/workflows/revert-watchdog.yml"), "utf8")
);
const JOBS = WORKFLOW.jobs;

const failed = (runAttempt) => decideRedConfirmation({ conclusion: "failure", runAttempt });
const cancelled = (runAttempt, previousConclusion) =>
  decideRedConfirmation({ conclusion: "cancelled", runAttempt, previousConclusion });

describe("decideRedConfirmation: a failed run", () => {
  it("reruns the failed jobs when the red run is a first attempt", () => {
    expect(failed(1).action).toBe("rerun");
  });

  it("proceeds once the run has failed again on the rerun", () => {
    expect(failed(2).action).toBe("proceed");
    expect(failed(3).action).toBe("proceed");
  });

  it("accepts the attempt as the string GitHub Actions passes", () => {
    expect(failed("1").action).toBe("rerun");
    expect(failed("2").action).toBe("proceed");
  });

  it("proceeds when the attempt is unknown, so a real break is never silenced", () => {
    for (const runAttempt of [undefined, null, "", "abc", 0, -1, 1.5]) {
      expect(failed(runAttempt).action).toBe("proceed");
    }
  });

  it("gives a reason for every decision", () => {
    expect(failed(1).reason).toMatch(/attempt 1/);
    expect(failed(2).reason).toMatch(/attempt 2/);
  });

  it("confirms with exactly one rerun", () => {
    expect(MAX_CONFIRMATION_RERUNS).toBe(1);
  });
});

describe("decideRedConfirmation: a cancelled run", () => {
  // CI run 43135240654 (f29ad0d49): attempt 1 failed, the rerun queued behind
  // the in-progress main run and the next push cancelled it 51 s later.
  it("proceeds when the rerun of a failed attempt was cancelled", () => {
    const decision = cancelled(2, "failure");
    expect(decision.action).toBe("proceed");
    expect(decision.reason).toMatch(/attempt 1/);
    expect(cancelled("3", "failure").action).toBe("proceed");
  });

  it("proceeds when the earlier attempt could not be read", () => {
    for (const previousConclusion of [undefined, null, "", "null"]) {
      expect(cancelled(2, previousConclusion).action).toBe("proceed");
    }
  });

  it("ignores a cancelled rerun of an attempt that had not failed", () => {
    for (const previousConclusion of ["cancelled", "success", "timed_out", "skipped"]) {
      expect(cancelled(2, previousConclusion).action).toBe("ignore");
    }
  });

  it("ignores a cancelled first attempt, as the watchdog always has", () => {
    expect(cancelled(1, undefined).action).toBe("ignore");
    expect(cancelled("1", "failure").action).toBe("ignore");
  });

  it("ignores a cancelled run whose attempt is unknown: it cannot be called a rerun", () => {
    for (const runAttempt of [undefined, "", "abc", 0]) {
      expect(cancelled(runAttempt, "failure").action).toBe("ignore");
    }
  });
});

describe("decideRedConfirmation: every other conclusion", () => {
  it("ignores conclusions the watchdog never acted on", () => {
    for (const conclusion of ["success", "timed_out", "skipped", "neutral", "action_required"]) {
      for (const runAttempt of [1, 2]) {
        expect(decideRedConfirmation({ conclusion, runAttempt }).action).toBe("ignore");
      }
    }
  });

  it("proceeds when the conclusion is missing: the job only runs for a red run", () => {
    for (const conclusion of [undefined, null, ""]) {
      expect(decideRedConfirmation({ conclusion, runAttempt: 1 }).action).toBe("proceed");
    }
  });
});

describe("main (the CLI entry)", () => {
  const run = (args) => {
    const chunks = [];
    main(args, { write: (chunk) => chunks.push(chunk) });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endsWith("\n")).toBe(true);
    return JSON.parse(chunks[0]);
  };

  it("prints the decision for a first-attempt failure as one JSON line", () => {
    expect(run(["--conclusion", "failure", "--run-attempt", "1"]).action).toBe("rerun");
  });

  it("reads the earlier attempt's conclusion for a cancelled rerun", () => {
    const base = ["--conclusion", "cancelled", "--run-attempt", "2", "--previous-conclusion"];
    expect(run([...base, "failure"]).action).toBe("proceed");
    expect(run([...base, "cancelled"]).action).toBe("ignore");
    expect(run([...base, ""]).action).toBe("proceed");
  });

  it("proceeds when called with no flags", () => {
    expect(run([]).action).toBe("proceed");
  });
});

// ---------------------------------------------------------------------------
// Workflow wiring. The `if:` expressions are read from the parsed YAML and
// evaluated, so a truth-table row fails when the expression changes meaning,
// not only when its text changes.
// ---------------------------------------------------------------------------

const TOKEN = /'[^']*'|\d+|[A-Za-z_][\w.-]*(?:\(\))?|==|!=|&&|\|\||[()>!]/g;

/** GitHub's loose comparison: mismatched types compare as numbers, strings ignore case. */
function compare(op, left, right) {
  let [a, b] = [left, right];
  if (typeof a !== typeof b) {
    const toNumber = (value) => (value === null ? 0 : Number(value));
    [a, b] = [toNumber(a), toNumber(b)];
  } else if (typeof a === "string") {
    [a, b] = [a.toLowerCase(), b.toLowerCase()];
  }
  if (op === "==") return a === b;
  if (op === "!=") return a !== b;
  return a > b;
}

/** Evaluates the subset of GitHub Actions expression syntax this workflow uses. */
function evaluate(expression, context) {
  const source = expression.replace(/^\$\{\{/, "").replace(/\}\}$/, "");
  const tokens = source.match(TOKEN) ?? [];
  if (tokens.join("") !== source.replace(/\s+/g, "")) {
    throw new Error(`unsupported expression syntax: ${expression}`);
  }
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  const primary = () => {
    const token = take();
    if (token === "(") {
      const value = or();
      take();
      return value;
    }
    if (token === "!") return !primary();
    if (token.startsWith("'")) return token.slice(1, -1);
    if (/^\d+$/.test(token)) return Number(token);
    if (token === "always()") return true;
    if (token.endsWith("()")) throw new Error(`unsupported function: ${token}`);
    return token.split(".").reduce((value, key) => value?.[key] ?? null, context);
  };
  const comparison = () => {
    const left = primary();
    return ["==", "!=", ">"].includes(peek()) ? compare(take(), left, primary()) : left;
  };
  const and = () => {
    let value = comparison();
    while (peek() === "&&") {
      take();
      const right = comparison();
      value = value && right;
    }
    return value;
  };
  function or() {
    let value = and();
    while (peek() === "||") {
      take();
      const right = and();
      value = value || right;
    }
    return value;
  }
  return Boolean(or());
}

const STATUS_FUNCTION = /\b(always|cancelled|failure|success)\(\)/;

/**
 * Whether a job runs. A job with `needs` is skipped when a needed job did not
 * succeed, unless its `if:` calls a status function such as `always()`.
 */
function jobRuns(name, context) {
  const job = JOBS[name];
  const needs = [].concat(job.needs ?? []);
  const blocked = needs.some((needed) => context.needs[needed].result !== "success");
  if (blocked && !STATUS_FUNCTION.test(job.if)) return false;
  return evaluate(job.if, context);
}

/**
 * Runs the three jobs for one event. `confirmRed` is what the confirm-red job
 * did IF it ran: `{result, confirmed}`. When its own `if:` is false the job is
 * skipped and has no outputs, whatever the row says.
 */
function runWatchdog({ event = "workflow_run", conclusion, attempt, confirmRed }) {
  const github = {
    event_name: event,
    event: event === "workflow_run" ? { workflow_run: { conclusion, run_attempt: attempt } } : {},
  };
  const confirmRuns = jobRuns("confirm-red", { github, needs: {} });
  const outcome = confirmRuns ? confirmRed : { result: "skipped" };
  const needs = {
    "confirm-red": { result: outcome.result, outputs: { confirmed: outcome.confirmed ?? "" } },
  };
  return {
    confirmRed: confirmRuns,
    onFailure: jobRuns("on-failure", { github, needs }),
    onSuccess: jobRuns("on-success", { github, needs }),
  };
}

describe("the expression evaluator used by the truth table", () => {
  it("compares the way GitHub Actions does", () => {
    const context = { a: { n: 2, s: "Failure", empty: "" } };
    expect(evaluate("${{ a.n > 1 }}", context)).toBe(true);
    expect(evaluate("${{ a.empty > 1 }}", context)).toBe(false);
    expect(evaluate("${{ a.missing > 1 }}", context)).toBe(false);
    expect(evaluate("${{ a.s == 'failure' }}", context)).toBe(true);
    expect(evaluate("${{ a.missing == 'true' }}", context)).toBe(false);
    expect(evaluate("${{ a.missing != 'success' }}", context)).toBe(true);
    expect(evaluate("${{ always() && (a.n == 3 || a.n == 2) }}", context)).toBe(true);
  });

  it("rejects syntax it does not model, so a new operator cannot pass unseen", () => {
    expect(() => evaluate("${{ a.n >= 1 }}", {})).toThrow(/unsupported/);
    expect(() => evaluate("${{ contains(a.s, 'x') }}", {})).toThrow(/unsupported/);
  });
});

describe("revert-watchdog.yml job conditions", () => {
  const RED =
    "github.event_name == 'workflow_run' && (github.event.workflow_run.conclusion == 'failure' || (github.event.workflow_run.conclusion == 'cancelled' && github.event.workflow_run.run_attempt > 1))";

  it("runs confirm-red for a failed run and for a cancelled rerun", () => {
    expect(JOBS["confirm-red"].if).toBe(`\${{ ${RED} }}`);
    expect(JOBS["confirm-red"].needs).toBeUndefined();
    expect(JOBS["confirm-red"].outputs).toEqual({
      confirmed: "${{ steps.decide.outputs.confirmed }}",
    });
  });

  it("gates on-failure on the confirmation and fails closed when confirm-red did not succeed", () => {
    expect(JOBS["on-failure"].needs).toBe("confirm-red");
    expect(JOBS["on-failure"].if).toBe(
      `\${{ always() && ${RED} && (needs.confirm-red.result != 'success' || needs.confirm-red.outputs.confirmed == 'true') }}`
    );
  });

  it("leaves on-success as it is on main", () => {
    expect(JOBS["on-success"].needs).toBeUndefined();
    expect(JOBS["on-success"].if).toBe(
      "${{ github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' }}"
    );
  });

  const RERUN_REQUESTED = { result: "success", confirmed: "false" };
  const CONFIRMED = { result: "success", confirmed: "true" };
  const IGNORED = { result: "success", confirmed: "false" };
  const JOB_FAILED = { result: "failure" };
  const JOB_CANCELLED = { result: "cancelled" };

  // [state, event, confirm-red outcome if it runs, expected {confirmRed, onFailure, onSuccess}]
  const TRUTH_TABLE = [
    [
      "attempt 1 failure, rerun requested",
      { conclusion: "failure", attempt: 1 },
      RERUN_REQUESTED,
      { confirmRed: true, onFailure: false, onSuccess: false },
    ],
    [
      "attempt 1 failure, the rerun API call failed",
      { conclusion: "failure", attempt: 1 },
      CONFIRMED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 2 failure",
      { conclusion: "failure", attempt: 2 },
      CONFIRMED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 3 failure",
      { conclusion: "failure", attempt: 3 },
      CONFIRMED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 2 cancelled after attempt 1 failed",
      { conclusion: "cancelled", attempt: 2 },
      CONFIRMED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 2 cancelled after an attempt that had not failed",
      { conclusion: "cancelled", attempt: 2 },
      IGNORED,
      { confirmRed: true, onFailure: false, onSuccess: false },
    ],
    [
      "attempt 1 cancelled",
      { conclusion: "cancelled", attempt: 1 },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: false },
    ],
    [
      "attempt 1 timed out",
      { conclusion: "timed_out", attempt: 1 },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: false },
    ],
    [
      "attempt 2 timed out",
      { conclusion: "timed_out", attempt: 2 },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: false },
    ],
    [
      "attempt 1 success",
      { conclusion: "success", attempt: 1 },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: true },
    ],
    [
      "attempt 2 success: the rerun passed, it was a flake",
      { conclusion: "success", attempt: 2 },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: true },
    ],
    [
      "failure with a blank attempt",
      { conclusion: "failure", attempt: "" },
      CONFIRMED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 1 failure, the confirm-red job itself failed",
      { conclusion: "failure", attempt: 1 },
      JOB_FAILED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 2 cancelled, the confirm-red job itself failed",
      { conclusion: "cancelled", attempt: 2 },
      JOB_FAILED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "attempt 1 failure, the confirm-red job was cancelled",
      { conclusion: "failure", attempt: 1 },
      JOB_CANCELLED,
      { confirmRed: true, onFailure: true, onSuccess: false },
    ],
    [
      "workflow_dispatch",
      { event: "workflow_dispatch" },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: false },
    ],
    [
      "pull_request closed",
      { event: "pull_request" },
      CONFIRMED,
      { confirmRed: false, onFailure: false, onSuccess: false },
    ],
  ];

  it.each(TRUTH_TABLE)("%s", (_state, event, confirmRed, expected) => {
    expect(runWatchdog({ ...event, confirmRed })).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// The confirm-red step itself, executed: the script from the parsed YAML runs
// under `bash -e` (the Actions default shell) against a stub `gh`.
// ---------------------------------------------------------------------------

describe("the confirm-red step", () => {
  const step = JOBS["confirm-red"].steps.find((candidate) => candidate.id === "decide");
  let sandbox;

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), "confirm-red-step-"));
    const stub = join(sandbox, "gh");
    writeFileSync(
      stub,
      [
        "#!/bin/bash",
        'echo "$*" >> "$GH_LOG"',
        'if [ "$1" = "run" ]; then exit "${STUB_RERUN_EXIT:-0}"; fi',
        'if [ "$1" = "api" ]; then',
        '  if [ "${STUB_API_EXIT:-0}" != "0" ]; then exit "$STUB_API_EXIT"; fi',
        '  echo "$STUB_PREVIOUS"',
        "  exit 0",
        "fi",
        "exit 1",
        "",
      ].join("\n")
    );
    chmodSync(stub, 0o755);
    writeFileSync(join(sandbox, "step.sh"), step.run);
  });

  afterAll(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  let runCount = 0;
  const runStep = ({ conclusion, attempt, stub = {}, cwd = ROOT }) => {
    runCount += 1;
    const output = join(sandbox, `output-${runCount}`);
    const ghLog = join(sandbox, `gh-${runCount}.log`);
    writeFileSync(output, "");
    const result = spawnSync("bash", ["-e", join(sandbox, "step.sh")], {
      cwd,
      encoding: "utf8",
      env: {
        PATH: `${sandbox}:${process.env.PATH}`,
        GITHUB_OUTPUT: output,
        GITHUB_REPOSITORY: "owner/repo",
        GH_LOG: ghLog,
        RUN_ID: "123",
        RUN_ATTEMPT: String(attempt),
        RUN_CONCLUSION: conclusion,
        ...stub,
      },
    });
    return {
      exitCode: result.status,
      output: readFileSync(output, "utf8").trim(),
      ghCalls: existsSync(ghLog) ? readFileSync(ghLog, "utf8").trim().split("\n") : [],
    };
  };

  it("takes every value from env and opens with pipefail", () => {
    expect(step.run).not.toContain("${{");
    expect(step.run.startsWith("set -o pipefail\n")).toBe(true);
    expect(step.env).toEqual({
      GH_TOKEN: "${{ github.token }}",
      RUN_ID: "${{ github.event.workflow_run.id }}",
      RUN_ATTEMPT: "${{ github.event.workflow_run.run_attempt }}",
      RUN_CONCLUSION: "${{ github.event.workflow_run.conclusion }}",
    });
  });

  it("attempt 1 failure: reruns the failed jobs and does not confirm", () => {
    const result = runStep({ conclusion: "failure", attempt: 1 });
    expect(result).toEqual({
      exitCode: 0,
      output: "confirmed=false",
      ghCalls: ["run rerun 123 --failed"],
    });
  });

  it("attempt 1 failure with the rerun call failing: confirms", () => {
    const result = runStep({
      conclusion: "failure",
      attempt: 1,
      stub: { STUB_RERUN_EXIT: "1" },
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "confirmed=true",
      ghCalls: ["run rerun 123 --failed"],
    });
  });

  it("attempt 2 failure: confirms without another rerun", () => {
    const result = runStep({ conclusion: "failure", attempt: 2 });
    expect(result).toEqual({ exitCode: 0, output: "confirmed=true", ghCalls: [] });
  });

  it("attempt 2 cancelled after a failed attempt 1: confirms", () => {
    const result = runStep({
      conclusion: "cancelled",
      attempt: 2,
      stub: { STUB_PREVIOUS: "failure" },
    });
    expect(result).toEqual({
      exitCode: 0,
      output: "confirmed=true",
      ghCalls: ["api repos/owner/repo/actions/runs/123/attempts/1 --jq .conclusion"],
    });
  });

  it("attempt 3 cancelled: reads attempt 2", () => {
    const result = runStep({
      conclusion: "cancelled",
      attempt: 3,
      stub: { STUB_PREVIOUS: "failure" },
    });
    expect(result.ghCalls).toEqual([
      "api repos/owner/repo/actions/runs/123/attempts/2 --jq .conclusion",
    ]);
    expect(result.output).toBe("confirmed=true");
  });

  it("attempt 2 cancelled after an attempt that had not failed: does not confirm", () => {
    const result = runStep({
      conclusion: "cancelled",
      attempt: 2,
      stub: { STUB_PREVIOUS: "cancelled" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("confirmed=false");
    expect(result.ghCalls).toHaveLength(1);
  });

  it("attempt 2 cancelled and the earlier attempt unreadable: confirms", () => {
    const result = runStep({
      conclusion: "cancelled",
      attempt: 2,
      stub: { STUB_API_EXIT: "1" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe("confirmed=true");
  });

  it.each(["", "abc"])("failure with attempt '%s': confirms", (attempt) => {
    const result = runStep({ conclusion: "failure", attempt });
    expect(result).toEqual({ exitCode: 0, output: "confirmed=true", ghCalls: [] });
  });

  it("confirms when confirm-red.mjs cannot run at all", () => {
    const result = runStep({ conclusion: "failure", attempt: 1, cwd: sandbox });
    expect(result).toEqual({ exitCode: 0, output: "confirmed=true", ghCalls: [] });
  });
});

// ---------------------------------------------------------------------------
// The sequence behind review finding 2: A breaks main, A's rerun is cancelled,
// B lands on top. Measured on f29ad0d49 (run 43135240654): once the rerun is
// cancelled, the commit's latest check runs hold no `CI Gate` at all, so the
// baseline code reads A as inconclusive (`null`).
// ---------------------------------------------------------------------------

describe("A breaks main, A's rerun is cancelled, B lands", () => {
  const conclusions = { parentOfA: "success", A: null, B: "failure" };
  const parents = { B: "A", A: "parentOfA" };
  const blame = (culpritSha) =>
    resolveRevertAction({
      culpritSha,
      parentSha: parents[culpritSha],
      prNumber: 1,
      getConclusionForSha: async (sha) => conclusions[sha],
      getParentSha: async (sha) => parents[sha] ?? null,
      getFailingTestPaths: async () => [],
      getChangedFiles: async () => [],
    });

  it("acts on A: the cancelled rerun is confirmed red and A is reported", async () => {
    expect(failed(1).action).toBe("rerun");
    expect(cancelled(2, "failure").action).toBe("proceed");
    expect((await blame("A")).action).toBe("issue-and-revert");
  });

  // Known gap, not fixed here: the baseline walk still steps past A, so B is
  // reported as well as A. Before this fix B was reported INSTEAD of A. The
  // follow-up is for the walk to read A's earlier attempt (`check-runs` with
  // `filter=all`), which would end B's walk at A as a pre-existing failure.
  it("still reports B too, because the baseline walk reads A as inconclusive", async () => {
    const decision = await blame("B");
    expect(decision.action).toBe("issue-and-revert");
    expect(decision.reason).toMatch(/parentOfA/);
  });
});
