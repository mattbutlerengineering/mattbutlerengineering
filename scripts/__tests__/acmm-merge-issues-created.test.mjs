import { describe, it, expect } from "vitest";
import { mergeIssuesCreated } from "../acmm-merge-issues-created.mjs";

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
