import { describe, it, expect } from "vitest";
import {
  checkFreshness,
  selectRecentAgentChanges,
  transformBehavioral,
} from "../generate-metrics-json.mjs";

describe("checkFreshness", () => {
  it("does not throw when lastRun is within the 14-day freshness window", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const lastRun = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => checkFreshness(lastRun, { now })).not.toThrow();
  });

  it("does not throw exactly at the 14-day boundary", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const lastRun = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => checkFreshness(lastRun, { now })).not.toThrow();
  });

  it("throws naming the state file and age when lastRun exceeds 14 days", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    const lastRun = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString();

    expect(() => checkFreshness(lastRun, { now, statePath: "/fake/state.json" })).toThrow(
      /\/fake\/state\.json/
    );
    expect(() => checkFreshness(lastRun, { now, statePath: "/fake/state.json" })).toThrow(
      /20\.0 days/
    );
  });

  it("throws naming the state file when lastRun is missing", () => {
    expect(() => checkFreshness(undefined, { statePath: "/fake/state.json" })).toThrow(
      /\/fake\/state\.json/
    );
  });
});

function stateWithChanges(recentChanges) {
  return { behavioral: { agent_pr: { recent_changes: recentChanges } } };
}

describe("selectRecentAgentChanges", () => {
  it("emits public PR fields newest first", () => {
    const state = stateWithChanges([
      {
        number: 10,
        title: "fix: older",
        url: "https://github.com/o/r/pull/10",
        mergedAt: "2026-07-01T00:00:00Z",
      },
      {
        number: 20,
        title: "feat: newer",
        url: "https://github.com/o/r/pull/20",
        mergedAt: "2026-07-20T00:00:00Z",
      },
    ]);

    expect(selectRecentAgentChanges(state)).toEqual([
      {
        number: 20,
        title: "feat: newer",
        url: "https://github.com/o/r/pull/20",
        mergedAt: "2026-07-20T00:00:00Z",
      },
      {
        number: 10,
        title: "fix: older",
        url: "https://github.com/o/r/pull/10",
        mergedAt: "2026-07-01T00:00:00Z",
      },
    ]);
  });

  it("caps the list at the configured limit", () => {
    const state = stateWithChanges(
      Array.from({ length: 25 }, (_, i) => ({
        number: i + 1,
        title: `fix: change ${i + 1}`,
        url: `https://github.com/o/r/pull/${i + 1}`,
        mergedAt: new Date(Date.UTC(2026, 6, 1, 0, i)).toISOString(),
      }))
    );

    expect(selectRecentAgentChanges(state)).toHaveLength(20);
    expect(selectRecentAgentChanges(state, { limit: 3 }).map((c) => c.number)).toEqual([
      25, 24, 23,
    ]);
  });

  it("returns an empty array when the state has no recent-change data", () => {
    expect(selectRecentAgentChanges({})).toEqual([]);
    expect(selectRecentAgentChanges({ behavioral: { agent_pr: null } })).toEqual([]);
    expect(selectRecentAgentChanges(stateWithChanges("not-an-array"))).toEqual([]);
    expect(selectRecentAgentChanges(stateWithChanges([]))).toEqual([]);
  });

  it("drops entries missing any public field", () => {
    const state = stateWithChanges([
      { number: 1, title: "no url", mergedAt: "2026-07-01T00:00:00Z" },
      { number: 2, title: "no mergedAt", url: "https://github.com/o/r/pull/2" },
      {
        title: "no number",
        url: "https://github.com/o/r/pull/3",
        mergedAt: "2026-07-01T00:00:00Z",
      },
      {
        number: 4,
        title: "complete",
        url: "https://github.com/o/r/pull/4",
        mergedAt: "2026-07-01T00:00:00Z",
      },
    ]);

    expect(selectRecentAgentChanges(state).map((c) => c.number)).toEqual([4]);
  });

  it("drops entries whose url is not a github.com PR link", () => {
    const state = stateWithChanges([
      {
        number: 1,
        title: "script url",
        url: "javascript:alert(1)",
        mergedAt: "2026-07-01T00:00:00Z",
      },
      {
        number: 2,
        title: "off-site url",
        url: "https://evil.example.com/pull/2",
        mergedAt: "2026-07-01T00:00:00Z",
      },
      {
        number: 3,
        title: "real pr",
        url: "https://github.com/o/r/pull/3",
        mergedAt: "2026-07-01T00:00:00Z",
      },
    ]);

    expect(selectRecentAgentChanges(state).map((c) => c.number)).toEqual([3]);
  });
});

describe("transformBehavioral", () => {
  const NOW = new Date("2026-09-28T16:07:00.000Z");
  const base = {
    behavioral: {
      flake: { rate_30d: 0.02 },
      agent_pr: { acceptance_rate_30d: 0.98, revert_rate_30d: 0 },
      evals: {
        n: 37,
        passRate: 0.8649,
        medianScore: 0.9,
        lastRun: "2026-05-10T21:42:57.095Z",
        windowDays: 30,
      },
    },
  };

  it("a stale eval reading emits null pass rate and median score, never a percentage", () => {
    const b = transformBehavioral(base, { now: NOW });
    expect(b.evalPassRate).toBeNull();
    expect(b.evalMedianScore).toBeNull();
    expect(b.evalsStale).toBe(true);
    expect(b.evalsLastRun).toBe("2026-05-10T21:42:57.095Z");
  });

  it("a current eval reading emits the live pass rate and median score", () => {
    const fresh = {
      behavioral: {
        ...base.behavioral,
        evals: { ...base.behavioral.evals, lastRun: "2026-09-25T00:00:00.000Z" },
      },
    };
    const b = transformBehavioral(fresh, { now: NOW });
    expect(b.evalPassRate).toBe(0.8649);
    expect(b.evalMedianScore).toBe(0.9);
    expect(b.evalsStale).toBe(false);
  });

  it("a null revert rate stays null instead of coercing to 0", () => {
    const nullRevert = {
      behavioral: {
        ...base.behavioral,
        agent_pr: { acceptance_rate_30d: 0.9, revert_rate_30d: null },
      },
    };
    expect(transformBehavioral(nullRevert, { now: NOW }).agentPrRevertRate).toBeNull();
    expect(transformBehavioral(base, { now: NOW }).agentPrRevertRate).toBe(0);
  });
});
