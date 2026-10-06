import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateRequiredResults, PASSING_RESULTS } from "../ci-gate-required-results.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const SCRIPT = resolve(ROOT, "scripts/ci-gate-required-results.mjs");
const CI_WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/ci.yml"), "utf8");

/** Build a `toJSON(needs)`-shaped object: every job `success` unless overridden. */
function needs({ hasCode = "true", results = {} } = {}) {
  const base = {
    "detect-changes": { result: "success", outputs: { has_code: hasCode } },
    prepare: { result: "success", outputs: {} },
    lint: { result: "success", outputs: {} },
    typecheck: { result: "success", outputs: {} },
    build: { result: "success", outputs: {} },
    test: { result: "success", outputs: {} },
    "a11y-attribution": { result: "skipped", outputs: {} },
  };
  return Object.fromEntries(
    Object.entries(base).map(([job, value]) => [
      job,
      job in results ? { ...value, result: results[job] } : value,
    ])
  );
}

describe("evaluateRequiredResults", () => {
  it("passes when every need is success or skipped", () => {
    expect(evaluateRequiredResults(needs()).ok).toBe(true);
  });

  it("only allowlists success and skipped", () => {
    expect([...PASSING_RESULTS].sort()).toEqual(["skipped", "success"]);
  });

  it("fails on failure and cancelled", () => {
    expect(evaluateRequiredResults(needs({ results: { test: "failure" } })).ok).toBe(false);
    expect(evaluateRequiredResults(needs({ results: { lint: "cancelled" } })).ok).toBe(false);
  });

  it("fails on abandoned (PR #6077 run 37363956419 attempt 2)", () => {
    const verdict = evaluateRequiredResults(
      needs({
        results: {
          prepare: "abandoned",
          lint: "skipped",
          typecheck: "skipped",
          build: "skipped",
          test: "skipped",
        },
      })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("\n")).toMatch(/prepare.*abandoned/);
  });

  it.each(["neutral", "timed_out", "action_required", "stale", "", "bogus"])(
    "fails closed on unrecognised result %j",
    (result) => {
      expect(evaluateRequiredResults(needs({ results: { build: result } })).ok).toBe(false);
    }
  );

  it("fails when a need has no result at all", () => {
    const n = needs();
    expect(evaluateRequiredResults({ ...n, build: { outputs: {} } }).ok).toBe(false);
    expect(evaluateRequiredResults({ ...n, build: null }).ok).toBe(false);
  });

  it("fails on empty or non-object needs", () => {
    for (const bad of [{}, null, undefined, [], "success"]) {
      expect(evaluateRequiredResults(bad).ok).toBe(false);
    }
  });

  it("fails when detect-changes or prepare is missing from needs", () => {
    const { prepare: _p, ...noPrepare } = needs();
    const { "detect-changes": _d, ...noDetect } = needs();
    expect(evaluateRequiredResults(noPrepare).ok).toBe(false);
    expect(evaluateRequiredResults(noDetect).ok).toBe(false);
  });

  it("fails when detect-changes was skipped (it has no if:, so it must succeed)", () => {
    expect(evaluateRequiredResults(needs({ results: { "detect-changes": "skipped" } })).ok).toBe(
      false
    );
  });

  it("fails when has_code is true but prepare skipped", () => {
    const verdict = evaluateRequiredResults(
      needs({
        hasCode: "true",
        results: { prepare: "skipped", lint: "skipped", build: "skipped", test: "skipped" },
      })
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.errors.join("\n")).toMatch(/has_code/);
  });

  it("passes a docs-only change (has_code false, prepare and build chain skipped)", () => {
    const verdict = evaluateRequiredResults(
      needs({
        hasCode: "false",
        results: {
          prepare: "skipped",
          lint: "skipped",
          typecheck: "skipped",
          build: "skipped",
          test: "skipped",
        },
      })
    );
    expect(verdict).toEqual({ ok: true, errors: [] });
  });

  it("fails when has_code is neither true nor false", () => {
    expect(evaluateRequiredResults(needs({ hasCode: "" })).ok).toBe(false);
    const n = needs();
    const noOutput = { ...n, "detect-changes": { result: "success", outputs: {} } };
    expect(evaluateRequiredResults(noOutput).ok).toBe(false);
  });
});

describe("ci-gate-required-results CLI", () => {
  function run(env) {
    try {
      execFileSync(process.execPath, [SCRIPT], {
        env: { ...process.env, ...env },
        stdio: "pipe",
      });
      return 0;
    } catch (err) {
      return err.status;
    }
  }

  it("exits 0 for a passing needs payload", () => {
    expect(run({ NEEDS_JSON: JSON.stringify(needs()) })).toBe(0);
  });

  it("exits 1 for an abandoned need", () => {
    expect(run({ NEEDS_JSON: JSON.stringify(needs({ results: { prepare: "abandoned" } })) })).toBe(
      1
    );
  });

  it("exits 1 when NEEDS_JSON is missing or malformed", () => {
    expect(run({ NEEDS_JSON: "" })).toBe(1);
    expect(run({ NEEDS_JSON: "{not json" })).toBe(1);
  });
});

describe("ci.yml CI Gate wiring", () => {
  const gateJob = CI_WORKFLOW.slice(CI_WORKFLOW.indexOf("\n  ci-gate:"));
  const step = gateJob.slice(
    gateJob.indexOf("- name: Check required job results"),
    gateJob.indexOf("- name: Publish CI Gate commit status")
  );

  it("passes the full needs context to the module", () => {
    expect(step).toMatch(/NEEDS_JSON:\s*\$\{\{\s*toJSON\(needs\)\s*\}\}/);
  });

  it("invokes the module under pipefail", () => {
    expect(step).toMatch(/set -euo pipefail/);
    expect(step).toMatch(/node scripts\/ci-gate-required-results\.mjs/);
  });

  it("no longer carries the fail-open inline failure/cancelled loop", () => {
    expect(step).not.toMatch(/= "failure" \] \|\| \[/);
  });

  it("keeps the gate-check id the commit-status step reads", () => {
    expect(step).toMatch(/id: gate-check/);
  });
});
