import { describe, it, expect } from "vitest";
import { mergeIssuesCreated, mergeHistory } from "../acmm-merge-issues-created.mjs";

describe("mergeIssuesCreated", () => {
  it("returns an empty object when both ledgers are empty/missing", () => {
    expect(mergeIssuesCreated(undefined, undefined)).toEqual({});
    expect(mergeIssuesCreated({}, {})).toEqual({});
  });

  it("keeps every entry when only the current ledger has entries", () => {
    const current = { "acmm:editor-config": 101 };
    expect(mergeIssuesCreated(current, undefined)).toEqual(current);
  });

  it("keeps every entry when only the branch ledger has entries", () => {
    const branch = { "acmm:editor-config": 202 };
    expect(mergeIssuesCreated(undefined, branch)).toEqual(branch);
  });

  it("unions disjoint keys from both ledgers", () => {
    const current = { "acmm:a": 1 };
    const branch = { "acmm:b": 2 };
    expect(mergeIssuesCreated(current, branch)).toEqual({ "acmm:a": 1, "acmm:b": 2 });
  });

  it("lets the branch ledger win on a conflicting key", () => {
    const current = { "acmm:editor-config": 101 };
    const branch = { "acmm:editor-config": 202 };
    expect(mergeIssuesCreated(current, branch)).toEqual({ "acmm:editor-config": 202 });
  });

  it("does not mutate either input", () => {
    const current = { "acmm:a": 1 };
    const branch = { "acmm:b": 2 };
    mergeIssuesCreated(current, branch);
    expect(current).toEqual({ "acmm:a": 1 });
    expect(branch).toEqual({ "acmm:b": 2 });
  });
});

describe("mergeHistory", () => {
  it("returns an empty array when both histories are empty/missing", () => {
    expect(mergeHistory(undefined, undefined)).toEqual([]);
    expect(mergeHistory([], [])).toEqual([]);
  });

  it("keeps a date that only exists on the stale branch (issue #9544)", () => {
    // Regression for #9544: a still-open automation/acmm-regression branch
    // carries a history row (e.g. 11-17) that `main` never saw. Recreating
    // the branch from `main` without merging history drops that row.
    const current = [
      { date: "2026-11-16", level: 71, detected: 60, total: 84 },
      { date: "2026-11-18", level: 73, detected: 61, total: 84 },
    ];
    const branch = [{ date: "2026-11-17", level: 73, detected: 60, total: 84 }];
    expect(mergeHistory(current, branch)).toEqual([
      { date: "2026-11-16", level: 71, detected: 60, total: 84 },
      { date: "2026-11-17", level: 73, detected: 60, total: 84 },
      { date: "2026-11-18", level: 73, detected: 61, total: 84 },
    ]);
  });

  it("lets the branch entry win on a conflicting date", () => {
    const current = [{ date: "2026-11-17", level: 72, detected: 59, total: 84 }];
    const branch = [{ date: "2026-11-17", level: 73, detected: 60, total: 84 }];
    expect(mergeHistory(current, branch)).toEqual([
      { date: "2026-11-17", level: 73, detected: 60, total: 84 },
    ]);
  });

  it("returns a date-sorted result regardless of input order", () => {
    const current = [{ date: "2026-11-18", level: 73, detected: 61, total: 84 }];
    const branch = [{ date: "2026-11-14", level: 73, detected: 59, total: 84 }];
    expect(mergeHistory(current, branch).map((h) => h.date)).toEqual(["2026-11-14", "2026-11-18"]);
  });

  it("does not mutate either input", () => {
    const current = [{ date: "2026-11-16", level: 71, detected: 60, total: 84 }];
    const branch = [{ date: "2026-11-17", level: 73, detected: 60, total: 84 }];
    mergeHistory(current, branch);
    expect(current).toEqual([{ date: "2026-11-16", level: 71, detected: 60, total: 84 }]);
    expect(branch).toEqual([{ date: "2026-11-17", level: 73, detected: 60, total: 84 }]);
  });
});
