/**
 * Unit tests for the agent-spend telemetry paired-growth check (#4618).
 *
 * The invariant under test is conditional: `.claude/agent-spend/sessions.jsonl`
 * must gain a row in the window whenever `metrics/queue-telemetry.jsonl` gains
 * one — the two files describe the same agent work from opposite ends, so
 * sibling growth without spend growth means the spend sink went silent.
 *
 * The states the classifier must keep apart are the whole point. #4618 is the
 * FOURTH report of "sessions.jsonl is empty" (#1830, #2974, #3695 before it),
 * and each earlier round repaired the `recordSpend` write path — which was
 * never broken. A detector that cannot tell "a writer ran and produced
 * nothing" (`stalled`) from "no writer could run at all" (`uninstrumented`)
 * would file that same wrong report a fifth time.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifySpendTelemetry,
  countRowsInWindow,
  assessAgentSpendTelemetry,
  isBlockedState,
  SPEND_TIMESTAMP_FIELDS,
  SIBLING_TIMESTAMP_FIELDS,
} from "../agent-spend-telemetry.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("classifySpendTelemetry", () => {
  it("passes as healthy when both files grew in the window", () => {
    const verdict = classifySpendTelemetry({
      spendRowsInWindow: 3,
      siblingRowsInWindow: 5,
      writerReachable: true,
    });
    expect(verdict.state).toBe("healthy");
    expect(verdict.ok).toBe(true);
  });

  it("fails as stalled when the sibling grew, spend did not, and a writer could have run", () => {
    const verdict = classifySpendTelemetry({
      spendRowsInWindow: 0,
      siblingRowsInWindow: 5,
      writerReachable: true,
    });
    expect(verdict.state).toBe("stalled");
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/queue-telemetry/);
  });

  it("reports uninstrumented — never stalled — when no writer could have run", () => {
    const verdict = classifySpendTelemetry({
      spendRowsInWindow: 0,
      siblingRowsInWindow: 5,
      writerReachable: false,
    });
    expect(verdict.state).toBe("uninstrumented");
    // Not a pass: a metric nothing can write is dead, not healthy.
    expect(verdict.ok).toBe(false);
  });

  it("trusts recorded rows over the reachability inference", () => {
    // Rows on disk are ground truth: something wrote them, so a writer is
    // demonstrably reachable no matter what the environment says.
    const verdict = classifySpendTelemetry({
      spendRowsInWindow: 2,
      siblingRowsInWindow: 5,
      writerReachable: false,
    });
    expect(verdict.state).toBe("healthy");
    expect(verdict.ok).toBe(true);
  });

  it("passes as idle when the sibling did not grow — the antecedent is false", () => {
    const verdict = classifySpendTelemetry({
      spendRowsInWindow: 0,
      siblingRowsInWindow: 0,
      writerReachable: true,
    });
    expect(verdict.state).toBe("idle");
    expect(verdict.ok).toBe(true);
  });

  it.each([
    [
      "spendRowsInWindow",
      { spendRowsInWindow: null, siblingRowsInWindow: 5, writerReachable: true },
    ],
    [
      "siblingRowsInWindow",
      { spendRowsInWindow: 0, siblingRowsInWindow: null, writerReachable: true },
    ],
    ["writerReachable", { spendRowsInWindow: 0, siblingRowsInWindow: 5, writerReachable: null }],
  ])("fails closed as undeterminable when %s is unknown", (_field, input) => {
    const verdict = classifySpendTelemetry(input);
    expect(verdict.state).toBe("undeterminable");
    expect(verdict.ok).toBe(false);
  });

  it("fails closed rather than coercing a non-numeric row count", () => {
    const verdict = classifySpendTelemetry({
      spendRowsInWindow: "0",
      siblingRowsInWindow: 5,
      writerReachable: true,
    });
    expect(verdict.state).toBe("undeterminable");
    expect(verdict.ok).toBe(false);
  });
});

describe("isBlockedState", () => {
  // The blocked/actionable split is what keeps a permanently-open
  // human-blocked issue from absorbing a genuine regression under a shared
  // dedupe key — the #5561 defect, which #5565 fixed for the sibling
  // freshness check in this same workflow.
  it("treats uninstrumented as human-blocked — it needs the #3585 decision", () => {
    expect(isBlockedState("uninstrumented")).toBe(true);
  });

  it.each(["stalled", "undeterminable"])("treats %s as actionable, not blocked", (state) => {
    expect(isBlockedState(state)).toBe(false);
  });

  it.each(["healthy", "idle"])("does not call the passing state %s blocked", (state) => {
    expect(isBlockedState(state)).toBe(false);
  });

  it("does not call an unrecognised state blocked", () => {
    // Fail toward actionable: a state nobody has classified must reach a human
    // as a failure, never be filed under the permanently-open blocked issue.
    expect(isBlockedState("something-new")).toBe(false);
  });
});

describe("countRowsInWindow", () => {
  const windowStartMs = Date.parse("2026-09-19T00:00:00Z");

  it("counts only rows at or after the window start", () => {
    const rows = [
      { timestamp: "2026-09-17T10:00:00Z" },
      { timestamp: "2026-09-19T10:00:00Z" },
      { timestamp: "2026-09-20T10:00:00Z" },
    ];
    expect(
      countRowsInWindow(rows, { timestampFields: SPEND_TIMESTAMP_FIELDS, windowStartMs })
    ).toBe(2);
  });

  it("falls back through the timestamp fields in order", () => {
    const rows = [{ merged_at: "2026-09-20T10:00:00Z" }];
    expect(
      countRowsInWindow(rows, { timestampFields: SIBLING_TIMESTAMP_FIELDS, windowStartMs })
    ).toBe(1);
  });

  it("returns 0 for an empty file — it demonstrably gained nothing", () => {
    expect(countRowsInWindow([], { timestampFields: SPEND_TIMESTAMP_FIELDS, windowStartMs })).toBe(
      0
    );
  });

  it("returns null for a non-array payload", () => {
    expect(
      countRowsInWindow(null, { timestampFields: SPEND_TIMESTAMP_FIELDS, windowStartMs })
    ).toBeNull();
  });

  it("returns null when rows exist but none carries a parseable timestamp", () => {
    const rows = [{ costUsd: 1 }, { timestamp: "not-a-date" }];
    expect(
      countRowsInWindow(rows, { timestampFields: SPEND_TIMESTAMP_FIELDS, windowStartMs })
    ).toBeNull();
  });
});

describe("assessAgentSpendTelemetry", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("reproduces the #4618 state: empty spend sink, fresh sibling, no provider key", () => {
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => [],
      readSiblingRows: () => [{ claimed_at: "2026-09-20T05:16:12.059Z" }],
      env: {},
      now,
    });
    expect(result.state).toBe("uninstrumented");
    expect(result.ok).toBe(false);
    expect(result.spendRowsInWindow).toBe(0);
    expect(result.siblingRowsInWindow).toBe(1);
    // Carried on the result so the workflow can route it with one `jq -r`
    // rather than re-deriving the classification in shell.
    expect(result.blocked).toBe(true);
  });

  it("reports stalled once a provider key makes the writer reachable", () => {
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => [],
      readSiblingRows: () => [{ claimed_at: "2026-09-20T05:16:12.059Z" }],
      env: { ANTHROPIC_API_KEY: "placeholder-value" },
      now,
    });
    expect(result.state).toBe("stalled");
    expect(result.ok).toBe(false);
    // Actionable, so it must NOT dedupe into the permanently-open blocked
    // issue — this is the regression the whole check exists to announce.
    expect(result.blocked).toBe(false);
  });

  it("treats an empty-string provider key as absent", () => {
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => [],
      readSiblingRows: () => [{ claimed_at: "2026-09-20T05:16:12.059Z" }],
      env: { ANTHROPIC_API_KEY: "" },
      now,
    });
    expect(result.state).toBe("uninstrumented");
  });

  it("fails closed instead of throwing when a reader throws", () => {
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => {
        throw new Error("ENOENT");
      },
      readSiblingRows: () => [{ claimed_at: "2026-09-20T05:16:12.059Z" }],
      env: {},
      now,
    });
    expect(result.state).toBe("undeterminable");
    expect(result.ok).toBe(false);
  });

  it("passes when both files grew inside the window", () => {
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => [{ timestamp: "2026-09-20T06:00:00Z", costUsd: 0.4 }],
      readSiblingRows: () => [{ claimed_at: "2026-09-20T05:16:12.059Z" }],
      env: { ANTHROPIC_API_KEY: "placeholder-value" },
      now,
    });
    expect(result.state).toBe("healthy");
    expect(result.ok).toBe(true);
  });

  it("honours a narrowed window", () => {
    // Both rows are ~6h old, so a 1h window excludes them and the verdict
    // becomes idle rather than healthy.
    const rows = { timestamp: "2026-09-20T06:00:00Z", claimed_at: "2026-09-20T06:00:00Z" };
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => [rows],
      readSiblingRows: () => [rows],
      env: { ANTHROPIC_API_KEY: "placeholder-value" },
      windowHours: 1,
      now,
    });
    expect(result.state).toBe("idle");
    expect(result.windowHours).toBe(1);
  });

  it("reports idle when neither file moved in the window", () => {
    const result = assessAgentSpendTelemetry({
      readSpendRows: () => [{ timestamp: "2026-01-01T06:00:00Z", costUsd: 0.4 }],
      readSiblingRows: () => [{ claimed_at: "2026-01-01T05:16:12.059Z" }],
      env: { ANTHROPIC_API_KEY: "placeholder-value" },
      now,
    });
    expect(result.state).toBe("idle");
    expect(result.ok).toBe(true);
  });
});

describe("wiring", () => {
  it("is invoked by a real workflow, not just unit-tested", () => {
    // The repo has shipped detectors that ran nowhere (#4628, #5529). A check
    // with green tests and no caller measures nothing.
    const dir = join(ROOT, ".github", "workflows");
    const referencing = readdirSync(dir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .filter((f) => readFileSync(join(dir, f), "utf-8").includes("agent-spend-telemetry.mjs"));
    expect(referencing).not.toEqual([]);
  });
});
