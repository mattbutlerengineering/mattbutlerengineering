import { describe, it, expect } from "vitest";
import { checkFreshness, selectRecentAgentChanges } from "../generate-metrics-json.mjs";

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
