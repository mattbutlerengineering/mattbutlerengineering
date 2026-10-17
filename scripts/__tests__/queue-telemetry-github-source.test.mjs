import { describe, it, expect } from "vitest";
import {
  parseReviewerVerdict,
  ciGateFirstPass,
  fetchPrFacts,
} from "../lib/queue-telemetry-github-source.mjs";

// Real comment bodies captured from merged agent PRs #6669 and #6670.
const PASS_6669 =
  "Review gate (inline): **PASS 9/10** — filter restricts denominator to success/failure; all 3 ACs covered by tests; zero-outcome path abstains (confidence: skip).";
const PASS_6670 =
  'Review gate (inline): **PASS 9/10**. Verified live: `gh issue view <closed-not-planned> --json state,stateReason` → `{"state":"CLOSED","stateReason":"NOT_PLANNED"}`, matching classifyIssueState. Circuit-breaker/synthetic-monitoring deps untouched.';
// No FLAG comment could be captured from the repo; same format, FLAG token.
const FLAG = "Review gate (inline): **FLAG 4/10** — missing test for the abstain path.";

describe("parseReviewerVerdict", () => {
  it("parses PASS from real captured bodies", () => {
    expect(parseReviewerVerdict([PASS_6669])).toBe("pass");
    expect(parseReviewerVerdict([PASS_6670])).toBe("pass");
  });
  it("parses FLAG and is case-insensitive", () => {
    expect(parseReviewerVerdict([FLAG])).toBe("flag");
    expect(parseReviewerVerdict(["review gate: **pass 8/10**"])).toBe("pass");
  });
  it("returns null when no verdict exists, including 'tests PASS' text", () => {
    expect(parseReviewerVerdict(["LGTM", "all tests PASS", "**PASS** locally"])).toBeNull();
    expect(parseReviewerVerdict([])).toBeNull();
  });
  it("last verdict wins", () => {
    expect(parseReviewerVerdict([FLAG, "noise", PASS_6669])).toBe("pass");
    expect(parseReviewerVerdict([PASS_6669, FLAG])).toBe("flag");
  });
});

describe("ciGateFirstPass", () => {
  // Real shapes: PR #6669's first SHA a2156933 had CI Gate failure (check run + status).
  it("is false for the failed first SHA of #6669", () => {
    expect(
      ciGateFirstPass({
        checkRuns: [{ name: "CI Gate", status: "completed", conclusion: "failure" }],
        statuses: [{ context: "CI Gate", state: "failure" }],
      })
    ).toBe(false);
  });
  it("is true on success from either source", () => {
    expect(
      ciGateFirstPass({
        checkRuns: [{ name: "CI Gate", status: "completed", conclusion: "success" }],
      })
    ).toBe(true);
    expect(ciGateFirstPass({ statuses: [{ context: "CI Gate", state: "success" }] })).toBe(true);
  });
  it("is null when neither source has CI Gate", () => {
    expect(
      ciGateFirstPass({ checkRuns: [{ name: "lint", conclusion: "failure" }], statuses: [] })
    ).toBeNull();
    expect(ciGateFirstPass({})).toBeNull();
  });
});

describe("fetchPrFacts", () => {
  const makeApi = (overrides = {}) => {
    const calls = [];
    const routes = {
      "/pulls/7": { state: "closed", merged_at: "2026-10-15T04:59:25Z", commits: 2 },
      "/pulls/7/commits": [{ sha: "first" }, { sha: "later" }],
      "/commits/first/check-runs": {
        check_runs: [{ name: "CI Gate", status: "completed", conclusion: "failure" }],
      },
      "/commits/first/statuses": [],
      "/commits/later/check-runs": {
        check_runs: [{ name: "CI Gate", status: "completed", conclusion: "success" }],
      },
      "/issues/7/comments": [{ body: PASS_6669 }],
      ...overrides,
    };
    const ghApi = (path) => {
      calls.push(path);
      const key = Object.keys(routes).find((k) => path.split("?")[0].endsWith(k));
      if (!key) throw new Error(`unexpected ${path}`);
      return routes[key];
    };
    return { ghApi, calls };
  };

  it("returns normalized facts and reads only the first SHA", async () => {
    const { ghApi, calls } = makeApi();
    expect(await fetchPrFacts(7, { ghApi })).toEqual({
      state: "MERGED",
      mergedAt: "2026-10-15T04:59:25Z",
      commitCount: 2,
      ciGateFirstPass: false,
      reviewerVerdict: "pass",
    });
    expect(calls.some((p) => p.includes("/commits/later/"))).toBe(false);
  });

  it("uses only REST paths", async () => {
    const { ghApi, calls } = makeApi();
    await fetchPrFacts(7, { ghApi });
    expect(calls.length).toBeGreaterThan(0);
    for (const p of calls) expect(p.startsWith("repos/")).toBe(true);
  });

  it("normalizes OPEN and CLOSED", async () => {
    expect(
      (await fetchPrFacts(7, makeApi({ "/pulls/7": { state: "open", merged_at: null } }))).state
    ).toBe("OPEN");
    expect(
      (await fetchPrFacts(7, makeApi({ "/pulls/7": { state: "closed", merged_at: null } }))).state
    ).toBe("CLOSED");
  });

  it("returns { error } instead of throwing, mapping 404 to pr-not-found", async () => {
    expect(
      await fetchPrFacts(7, {
        ghApi: () => {
          throw new Error("boom");
        },
      })
    ).toEqual({ error: "boom" });
    expect(
      await fetchPrFacts(7, {
        ghApi: () => {
          throw new Error("gh: Not Found (HTTP 404)");
        },
      })
    ).toEqual({ error: "pr-not-found" });
  });
});
