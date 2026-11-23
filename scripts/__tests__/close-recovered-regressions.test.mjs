import { describe, it, expect, vi } from "vitest";
import {
  parseRegressionIssue,
  decideRegressionClose,
  closeRecoveredRegressions,
} from "../close-recovered-regressions.mjs";

const body = (over = {}) =>
  [
    "## Regression Detected",
    "",
    `**Sensor:** ${over.sensor ?? "ciHealth"}`,
    `**Metric:** ${over.metric ?? "pass_rate_pct"}`,
    `**Current:** ${over.current ?? 91}`,
    `**Previous:** ${over.previous ?? 100}`,
    `**Delta:** ${over.delta ?? -9}`,
    "**Severity:** high",
    "",
    over.footer ??
      "_Detected by [learning-loop](../.claude/skills/learning-loop/SKILL.md) sensor report_",
  ].join("\n");

const issue = (over = {}) => ({ number: 9421, body: body(over), ...over.issue });

describe("parseRegressionIssue", () => {
  it("reads sensor, metric, previous and delta from a learning-loop issue", () => {
    expect(parseRegressionIssue(issue())).toEqual({
      sensor: "ciHealth",
      metric: "pass_rate_pct",
      previous: 100,
      delta: -9,
    });
  });
  it("returns null when not filed by the learning loop", () => {
    expect(
      parseRegressionIssue(
        issue({ footer: "_Detected by [optimize-implement-queue](x) daily skill_" })
      )
    ).toBeNull();
    expect(parseRegressionIssue({ number: 1, body: "human wrote this" })).toBeNull();
  });
  it("returns null for a pull request", () => {
    expect(parseRegressionIssue(issue({ issue: { pull_request: {} } }))).toBeNull();
  });
});

describe("decideRegressionClose", () => {
  const sensors = (v) => ({ ciHealth: { available: true, pass_rate_pct: v } });
  it("closes when a higher-is-better metric is back at previous or above", () => {
    const d = decideRegressionClose(issue(), sensors(100));
    expect(d).toMatchObject({ action: "close", current: 100, previous: 100 });
  });
  it("keeps open while the metric is still below previous", () => {
    expect(decideRegressionClose(issue(), sensors(95)).action).toBe("keep");
  });
  it("handles lower-is-better metrics via the delta sign", () => {
    const i = issue({ metric: "churn", sensor: "x", previous: 0.2, current: 0.4, delta: 0.2 });
    expect(decideRegressionClose(i, { x: { available: true, churn: 0.2 } }).action).toBe("close");
    expect(decideRegressionClose(i, { x: { available: true, churn: 0.3 } }).action).toBe("keep");
  });
  it("keeps open when the sensor is unavailable or the metric missing", () => {
    expect(decideRegressionClose(issue(), { ciHealth: { available: false } }).action).toBe("keep");
    expect(decideRegressionClose(issue(), {}).action).toBe("keep");
  });
  it("skips issues the loop did not file", () => {
    expect(decideRegressionClose({ number: 5, body: "x" }, sensors(100)).action).toBe("skip");
  });
});

describe("closeRecoveredRegressions", () => {
  const mk = (extra = {}) => ({
    listIssues: vi.fn(async () => [issue(), { number: 9308, body: "other" }]),
    collectSensors: vi.fn(async () => ({ ciHealth: { available: true, pass_rate_pct: 100 } })),
    closeIssue: vi.fn(async () => {}),
    log: vi.fn(),
    ...extra,
  });
  it("closes recovered issues with an evidence comment and completed reason", async () => {
    const d = mk();
    await closeRecoveredRegressions(d);
    expect(d.closeIssue).toHaveBeenCalledTimes(1);
    const [n, comment, reason] = d.closeIssue.mock.calls[0];
    expect(n).toBe(9421);
    expect(reason).toBe("completed");
    expect(comment).toMatch(/ciHealth/);
    expect(comment).toMatch(/pass_rate_pct/);
    expect(comment).toMatch(/100/);
  });
  it("never closes an issue the loop did not file", async () => {
    const d = mk({ listIssues: vi.fn(async () => [{ number: 9308, body: "other" }]) });
    await closeRecoveredRegressions(d);
    expect(d.closeIssue).not.toHaveBeenCalled();
  });
  it("leaves an unrecovered issue open", async () => {
    const d = mk({
      collectSensors: vi.fn(async () => ({ ciHealth: { available: true, pass_rate_pct: 90 } })),
    });
    await closeRecoveredRegressions(d);
    expect(d.closeIssue).not.toHaveBeenCalled();
  });
  it("dry-run prints the decision and writes nothing", async () => {
    const d = mk();
    await closeRecoveredRegressions({ ...d, dryRun: true });
    expect(d.closeIssue).not.toHaveBeenCalled();
    expect(d.log.mock.calls.flat().join("\n")).toMatch(/dry-run.*#9421/s);
  });
});
