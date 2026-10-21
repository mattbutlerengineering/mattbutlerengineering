import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { createGhClient, GhAuthError } from "@mbe/gh-client";
import {
  classifyIssue,
  extractLinkedPrs,
  fetchLinkedPrsByIssue,
  attachLinkedPrs,
  acceptedGuardWarning,
  createTimelineFetcher,
  computeCategoryRates,
  computeIssueBudget,
  queryClosedIssuesForFeedback,
  CATEGORIES,
  DEFAULT_BUDGET_PER_CATEGORY,
  REJECTION_THRESHOLD,
  ISSUE_JSON_FIELDS,
} from "../collect-ai-issue-feedback.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeIssue = (overrides = {}) => ({
  number: 1,
  state: "CLOSED",
  labels: [{ name: "audit" }],
  createdAt: "2026-06-01T00:00:00Z",
  closedAt: "2026-06-02T00:00:00Z",
  stateReason: "COMPLETED",
  linkedPrs: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// classifyIssue
// ---------------------------------------------------------------------------

describe("classifyIssue", () => {
  it("classifies as accepted when issue has a merged linked PR", () => {
    const issue = makeIssue({
      linkedPrs: [{ number: 10, state: "MERGED" }],
      stateReason: "COMPLETED",
    });
    expect(classifyIssue(issue)).toBe("accepted");
  });

  it("classifies as rejected when closed without merge and stateReason NOT_PLANNED", () => {
    const issue = makeIssue({
      linkedPrs: [],
      stateReason: "NOT_PLANNED",
    });
    expect(classifyIssue(issue)).toBe("rejected");
  });

  it("classifies as wontfix when closed with COMPLETED but no merged PR", () => {
    const issue = makeIssue({
      linkedPrs: [],
      stateReason: "COMPLETED",
    });
    expect(classifyIssue(issue)).toBe("wontfix");
  });

  it("classifies as wontfix when closed with unmerged linked PRs", () => {
    const issue = makeIssue({
      linkedPrs: [{ number: 10, state: "CLOSED" }],
      stateReason: "COMPLETED",
    });
    expect(classifyIssue(issue)).toBe("wontfix");
  });

  it("classifies as accepted when one of several linked PRs merged", () => {
    const issue = makeIssue({
      linkedPrs: [
        { number: 10, state: "CLOSED" },
        { number: 11, state: "MERGED" },
      ],
      stateReason: "COMPLETED",
    });
    expect(classifyIssue(issue)).toBe("accepted");
  });

  it("a merged linked PR wins over a NOT_PLANNED stateReason", () => {
    const issue = makeIssue({
      linkedPrs: [{ number: 10, state: "MERGED" }],
      stateReason: "NOT_PLANNED",
    });
    expect(classifyIssue(issue)).toBe("accepted");
  });

  it("falls back to the stateReason when linkedPrs is absent", () => {
    const issue = makeIssue({ stateReason: "NOT_PLANNED" });
    delete issue.linkedPrs;
    expect(classifyIssue(issue)).toBe("rejected");
  });

  it("returns null for open issues", () => {
    const issue = makeIssue({ state: "OPEN", closedAt: null });
    expect(classifyIssue(issue)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeCategoryRates
// ---------------------------------------------------------------------------

describe("computeCategoryRates", () => {
  it("computes rates per category from classified issues", () => {
    const issues = [
      makeIssue({ labels: [{ name: "audit" }], linkedPrs: [{ number: 1, state: "MERGED" }] }),
      makeIssue({ labels: [{ name: "audit" }], stateReason: "NOT_PLANNED", linkedPrs: [] }),
      makeIssue({ labels: [{ name: "audit" }], linkedPrs: [{ number: 2, state: "MERGED" }] }),
      makeIssue({ labels: [{ name: "ci-fix" }], linkedPrs: [{ number: 3, state: "MERGED" }] }),
    ];

    const rates = computeCategoryRates(issues);
    expect(rates.audit.total).toBe(3);
    expect(rates.audit.accepted).toBe(2);
    expect(rates.audit.rejected).toBe(1);
    expect(rates.audit.wontfix).toBe(0);
    expect(rates.audit.rejection_rate).toBeCloseTo(1 / 3);
    expect(rates["ci-fix"].total).toBe(1);
    expect(rates["ci-fix"].accepted).toBe(1);
    expect(rates["ci-fix"].rejection_rate).toBe(0);
  });

  it("returns empty rates for categories with no issues", () => {
    const rates = computeCategoryRates([]);
    expect(rates.audit).toBeUndefined();
  });

  it("handles issues with multiple category labels by counting in first matching category", () => {
    const issues = [
      makeIssue({
        labels: [{ name: "audit" }, { name: "acmm" }],
        linkedPrs: [{ number: 1, state: "MERGED" }],
      }),
    ];
    const rates = computeCategoryRates(issues);
    // Should be counted in "audit" (first matching category)
    expect(rates.audit.total).toBe(1);
    // Should NOT be double-counted in acmm
    expect(rates.acmm).toBeUndefined();
  });

  it("skips open issues", () => {
    const issues = [makeIssue({ state: "OPEN", closedAt: null, labels: [{ name: "audit" }] })];
    const rates = computeCategoryRates(issues);
    expect(rates.audit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeIssueBudget
// ---------------------------------------------------------------------------

describe("computeIssueBudget", () => {
  it("returns default budget when rejection rate is below threshold", () => {
    const rates = {
      audit: { total: 10, accepted: 8, rejected: 1, wontfix: 1, rejection_rate: 0.1 },
    };
    const budget = computeIssueBudget("audit", rates);
    expect(budget).toBe(DEFAULT_BUDGET_PER_CATEGORY);
  });

  it("halves budget when rejection rate exceeds threshold (>40%)", () => {
    const rates = {
      audit: { total: 10, accepted: 5, rejected: 5, wontfix: 0, rejection_rate: 0.5 },
    };
    const budget = computeIssueBudget("audit", rates);
    expect(budget).toBe(Math.floor(DEFAULT_BUDGET_PER_CATEGORY / 2));
  });

  it("returns default budget when category has no data", () => {
    const rates = {};
    const budget = computeIssueBudget("audit", rates);
    expect(budget).toBe(DEFAULT_BUDGET_PER_CATEGORY);
  });

  it("returns default budget at exactly the threshold boundary", () => {
    const rates = {
      audit: { total: 10, accepted: 6, rejected: 4, wontfix: 0, rejection_rate: 0.4 },
    };
    const budget = computeIssueBudget("audit", rates);
    // 0.4 is exactly at threshold (>0.4 triggers), so should NOT halve
    expect(budget).toBe(DEFAULT_BUDGET_PER_CATEGORY);
  });

  it("halves budget at 41% rejection rate", () => {
    const rates = {
      sentry: { total: 100, accepted: 59, rejected: 41, wontfix: 0, rejection_rate: 0.41 },
    };
    const budget = computeIssueBudget("sentry", rates);
    expect(budget).toBe(Math.floor(DEFAULT_BUDGET_PER_CATEGORY / 2));
  });
});

// ---------------------------------------------------------------------------
// queryClosedIssuesForFeedback — injected `listIssues`, zero real `gh` calls.
//
// #3937: an auth failure (Claude Code Remote's REST fallback token isn't
// valid for direct api.github.com calls) must be distinguishable from a
// legitimately empty result set, instead of both collapsing to the same
// `safe()`-swallowed "no data" shape.
// ---------------------------------------------------------------------------

describe("queryClosedIssuesForFeedback", () => {
  it("returns ok:true with the raw issues on success", () => {
    const issues = [makeIssue()];
    const result = queryClosedIssuesForFeedback(() => issues);

    expect(result).toEqual({ ok: true, issues });
  });

  it("returns ok:true with an empty array when the query legitimately finds nothing", () => {
    const result = queryClosedIssuesForFeedback(() => []);

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it("returns ok:false with a distinguishable reason when the query throws (e.g. auth failure)", () => {
    const result = queryClosedIssuesForFeedback(() => {
      throw new GhAuthError("GET", "/repos/o/r/issues", 401, "Bad credentials");
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/auth/i);
  });
});

// ---------------------------------------------------------------------------
// #6312 — REST success path, pinned end to end through the REAL gh-client REST
// runner with an injected HTTP seam (no network, no `gh`).
// ---------------------------------------------------------------------------

describe("REST success path (#6312)", () => {
  const restItem = (number, label, stateReason) => ({
    number,
    title: `issue ${number}`,
    state: "closed",
    state_reason: stateReason,
    labels: [{ name: label }],
    created_at: "2026-10-01T00:00:00Z",
    closed_at: "2026-10-02T00:00:00Z",
  });

  function collectViaRest(items) {
    const urls = [];
    const http = ({ url }) => {
      const decoded = decodeURIComponent(url);
      urls.push(decoded);
      // Repo-scoped /issues (the Search API is blocked in CCR, #6445): labels= is
      // a single category member, so answer with just the matching items.
      const member = new URL(decoded).searchParams.get("labels");
      const matching = items.filter((i) => i.labels.some((l) => l.name === member));
      return { status: 200, body: JSON.stringify(matching) };
    };
    const client = createGhClient({
      probe: () => false,
      token: "t",
      owner: "o",
      repoName: "r",
      http,
    });
    return { result: queryClosedIssuesForFeedback((a) => client.issue.list(a)), urls };
  }

  it("queries each category member via repo-scoped /issues, never the Search API", () => {
    // The Search API is blocked in CCR sessions (#6445); the OR is realised as
    // one labels=<member> request per category.
    const { urls } = collectViaRest([]);
    for (const category of CATEGORIES) {
      expect(urls.some((u) => u.includes("/issues?") && u.includes(`labels=${category}`))).toBe(
        true
      );
    }
    expect(urls.some((u) => u.includes("/search/"))).toBe(false);
  });

  it("turns REST search results into per-category rates", () => {
    const { result } = collectViaRest([
      restItem(1, "audit", "completed"),
      restItem(2, "audit", "not_planned"),
      restItem(3, "ci-fix", "completed"),
    ]);
    expect(result.ok).toBe(true);
    const rates = computeCategoryRates(result.issues.map((i) => ({ ...i, linkedPrs: [] })));
    expect(rates.audit).toMatchObject({ total: 2, rejected: 1, wontfix: 1 });
    expect(rates["ci-fix"]).toMatchObject({ total: 1, wontfix: 1 });
  });

  it("classifies a lowercase REST state_reason of not_planned as rejected", () => {
    expect(classifyIssue(makeIssue({ stateReason: "not_planned" }))).toBe("rejected");
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("constants", () => {
  it("CATEGORIES includes all expected categories", () => {
    expect(CATEGORIES).toContain("audit");
    expect(CATEGORIES).toContain("ci-fix");
    expect(CATEGORIES).toContain("agent-failed");
    expect(CATEGORIES).toContain("meta-improvement");
    expect(CATEGORIES).toContain("sentry");
    expect(CATEGORIES).toContain("acmm");
    expect(CATEGORIES).toContain("feature");
    expect(CATEGORIES).toContain("dependencies");
  });

  it("REJECTION_THRESHOLD is 0.4", () => {
    expect(REJECTION_THRESHOLD).toBe(0.4);
  });

  it("DEFAULT_BUDGET_PER_CATEGORY is a positive integer", () => {
    expect(DEFAULT_BUDGET_PER_CATEGORY).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_BUDGET_PER_CATEGORY)).toBe(true);
  });

  it("ISSUE_JSON_FIELDS contains only valid gh issue list fields", () => {
    // gh issue list --json rejects unknown fields and prints an error listing valid ones
    const VALID_GH_ISSUE_FIELDS = new Set([
      "assignees",
      "author",
      "body",
      "closed",
      "closedAt",
      "comments",
      "createdAt",
      "id",
      "isPinned",
      "labels",
      "milestone",
      "number",
      "projectCards",
      "projectItems",
      "reactionGroups",
      "state",
      "stateReason",
      "title",
      "updatedAt",
      "url",
    ]);
    const fields = ISSUE_JSON_FIELDS.split(",");
    for (const field of fields) {
      expect(
        VALID_GH_ISSUE_FIELDS.has(field),
        `"${field}" is not a valid gh issue list field`
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// linked-PR adapter (#7198)
// ---------------------------------------------------------------------------

const xref = (number, { merged = true, body = "Closes #5" } = {}) => ({
  event: "cross-referenced",
  source: {
    type: "issue",
    issue: { number, body, pull_request: { merged_at: merged ? "2026-10-01T00:00:00Z" : null } },
  },
});

describe("extractLinkedPrs", () => {
  it("returns merged PRs whose body closes the issue", () => {
    expect(extractLinkedPrs(5, [xref(10)])).toEqual([{ number: 10, state: "MERGED" }]);
  });

  it("ignores unmerged PRs, plain mentions, non-PR sources and other events", () => {
    const events = [
      xref(11, { merged: false }),
      xref(12, { body: "see #5 for context" }),
      xref(13, { body: "Closes #55" }),
      {
        event: "cross-referenced",
        source: { type: "issue", issue: { number: 14, body: "Fixes #5" } },
      },
      { event: "labeled" },
    ];
    expect(extractLinkedPrs(5, events)).toEqual([]);
  });

  it("accepts fix/resolve keyword variants case-insensitively", () => {
    const events = [xref(20, { body: "fixed #5" }), xref(21, { body: "RESOLVES #5" })];
    expect(extractLinkedPrs(5, events).map((p) => p.number)).toEqual([20, 21]);
  });
});

describe("fetchLinkedPrsByIssue", () => {
  it("maps each issue number to its linked PRs", async () => {
    const getTimeline = async (n) => (n === 5 ? [xref(10)] : []);
    const { linkedPrsByIssue, failures } = await fetchLinkedPrsByIssue([5, 6], getTimeline);
    expect(linkedPrsByIssue.get(5)).toEqual([{ number: 10, state: "MERGED" }]);
    expect(linkedPrsByIssue.get(6)).toEqual([]);
    expect(failures).toBe(0);
  });

  it("follows pages until a short page", async () => {
    const full = Array.from({ length: 100 }, () => ({ event: "labeled" }));
    const calls = [];
    const getTimeline = async (n, page) => {
      calls.push(page);
      return page === 1 ? full : [xref(10)];
    };
    const { linkedPrsByIssue } = await fetchLinkedPrsByIssue([5], getTimeline);
    expect(calls).toEqual([1, 2]);
    expect(linkedPrsByIssue.get(5)).toEqual([{ number: 10, state: "MERGED" }]);
  });

  it("degrades to [] and counts a failure instead of throwing", async () => {
    const getTimeline = async () => {
      throw new Error("boom");
    };
    const { linkedPrsByIssue, failures } = await fetchLinkedPrsByIssue([5, 6], getTimeline);
    expect(linkedPrsByIssue.get(5)).toEqual([]);
    expect(linkedPrsByIssue.get(6)).toEqual([]);
    expect(failures).toBe(2);
  });

  it("stops calling the API after a rate-limit error", async () => {
    let calls = 0;
    const getTimeline = async () => {
      calls += 1;
      throw new Error("API rate limit exceeded (403)");
    };
    const { linkedPrsByIssue, failures } = await fetchLinkedPrsByIssue(
      [1, 2, 3, 4, 5, 6, 7, 8],
      getTimeline,
      { concurrency: 1 }
    );
    expect(calls).toBe(1);
    expect(failures).toBe(8);
    expect(linkedPrsByIssue.get(8)).toEqual([]);
  });

  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;
    const getTimeline = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return [];
    };
    await fetchLinkedPrsByIssue([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], getTimeline, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
  });
});

describe("linked-PR wiring (#7199)", () => {
  const closedIssue = (number) => ({
    number,
    state: "CLOSED",
    stateReason: "COMPLETED",
    labels: [{ name: "feature" }],
  });
  const mergedXref = (prNumber, issueNumber) => ({
    event: "cross-referenced",
    source: {
      type: "issue",
      issue: {
        number: prNumber,
        body: `Closes #${issueNumber}`,
        pull_request: { merged_at: "2026-10-02T00:00:00Z" },
      },
    },
  });

  it("reports accepted > 0 when stubbed merged PRs closed issues", async () => {
    const getTimeline = async (n) => (n === 1 ? [mergedXref(10, 1)] : []);
    const { issues, failures } = await attachLinkedPrs(
      [closedIssue(1), closedIssue(2)],
      getTimeline
    );
    expect(failures).toBe(0);
    expect(computeCategoryRates(issues).feature).toMatchObject({
      total: 2,
      accepted: 1,
      wontfix: 1,
    });
  });

  it("degrades to wontfix, counting failures, when lookups fail", async () => {
    const getTimeline = async () => {
      throw new Error("boom");
    };
    const { issues, failures } = await attachLinkedPrs([closedIssue(1)], getTimeline);
    expect(failures).toBe(1);
    expect(computeCategoryRates(issues).feature.accepted).toBe(0);
  });

  it("fetches the timeline through gh api REST", async () => {
    const calls = [];
    const exec = async (file, args) => {
      calls.push([file, ...args]);
      return { stdout: "[]" };
    };
    await createTimelineFetcher("o/r", exec)(7, 2);
    expect(calls).toEqual([["gh", "api", "repos/o/r/issues/7/timeline?per_page=100&page=2"]]);
  });

  it("no longer hardcodes linkedPrs: []", () => {
    const src = readFileSync(new URL("../collect-ai-issue-feedback.mjs", import.meta.url), "utf8");
    expect(src).not.toMatch(/linkedPrs:\s*\[\]/);
  });
});

describe("accepted guard (#7201)", () => {
  const closed = (number) => ({
    number,
    state: "CLOSED",
    stateReason: "COMPLETED",
    labels: [{ name: "feature" }],
  });
  const xref = (pr, n) => ({
    event: "cross-referenced",
    source: {
      type: "issue",
      issue: {
        number: pr,
        body: `Closes #${n}`,
        pull_request: { merged_at: "2026-10-02T00:00:00Z" },
      },
    },
  });

  it("is silent when real detection reports accepted > 0", async () => {
    const { issues, failures } = await attachLinkedPrs([closed(1)], async () => [xref(9, 1)]);
    const rates = computeCategoryRates(issues);
    expect(acceptedGuardWarning(issues, rates, failures)).toBeNull();
  });

  it("flags zero accepted everywhere while merged PRs exist (old stub behaviour)", () => {
    const stubbed = [{ ...closed(1), linkedPrs: [{ number: 9, state: "OPEN" }] }];
    const rates = computeCategoryRates([{ ...closed(1), linkedPrs: [] }]);
    const withMerged = [{ ...closed(1), linkedPrs: [{ number: 9, state: "MERGED" }] }];
    expect(rates.feature.accepted).toBe(0);
    expect(acceptedGuardWarning(withMerged, rates, 0)).toMatch(/merged closing PR/);
    expect(acceptedGuardWarning(stubbed, rates, 0)).toBeNull();
  });

  it("flags a wholesale lookup failure", async () => {
    const { issues, failures } = await attachLinkedPrs([closed(1), closed(2)], async () => {
      throw new Error("boom");
    });
    const warning = acceptedGuardWarning(issues, computeCategoryRates(issues), failures);
    expect(warning).toMatch(/lookups failed/);
  });

  it("stays quiet for a genuine zero (lookups ran, nothing merged)", async () => {
    const { issues, failures } = await attachLinkedPrs([closed(1)], async () => []);
    expect(acceptedGuardWarning(issues, computeCategoryRates(issues), failures)).toBeNull();
  });
});
