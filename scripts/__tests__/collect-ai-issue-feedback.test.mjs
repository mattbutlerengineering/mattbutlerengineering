import { describe, it, expect } from "vitest";
import {
  classifyIssue,
  computeCategoryRates,
  computeIssueBudget,
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
