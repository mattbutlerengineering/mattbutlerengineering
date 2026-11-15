import { describe, it, expect } from "vitest";
import {
  classifyIssues,
  linkedPullRequests,
  STATE_LABELS,
  EXCLUDED_LABELS,
  formatReport,
} from "../reconcile-issue-states.mjs";

const issue = (number, labels = []) => ({ number, labels, title: `issue ${number}` });
const pr = (number, state, merged) => ({ number, state, merged });

describe("classifyIssues", () => {
  it("lists an open issue with no state label as stateless", () => {
    const out = classifyIssues([{ issue: issue(1, ["bug"]), prs: [] }]);
    expect(out.stateless).toEqual([1]);
  });

  it.each(STATE_LABELS)("does not list an issue carrying %s as stateless", (label) => {
    const out = classifyIssues([{ issue: issue(1, [label]), prs: [] }]);
    expect(out.stateless).toEqual([]);
  });

  it.each(EXCLUDED_LABELS)("ignores an issue labelled %s", (label) => {
    const out = classifyIssues([{ issue: issue(1, [label]), prs: [] }]);
    expect(out).toEqual({ stateless: [], toReady: [], mergedReport: [], noPr: [] });
  });

  it("leaves has-pr alone while any linked PR is open", () => {
    const out = classifyIssues([
      { issue: issue(2, ["has-pr"]), prs: [pr(10, "open", false), pr(11, "closed", false)] },
    ]);
    expect(out.toReady).toEqual([]);
    expect(out.mergedReport).toEqual([]);
  });

  it("sends has-pr with all PRs closed unmerged back to ready", () => {
    const out = classifyIssues([
      { issue: issue(3, ["has-pr"]), prs: [pr(10, "closed", false), pr(11, "closed", false)] },
    ]);
    expect(out.toReady).toEqual([3]);
  });

  it("reports has-pr with a merged PR and no open PR", () => {
    const out = classifyIssues([
      { issue: issue(4, ["has-pr"]), prs: [pr(10, "closed", true), pr(11, "closed", false)] },
    ]);
    expect(out.mergedReport).toEqual([4]);
    expect(out.toReady).toEqual([]);
  });

  it("reports has-pr with no linked PR at all, never re-queues it", () => {
    const out = classifyIssues([{ issue: issue(5, ["has-pr"]), prs: [] }]);
    expect(out.noPr).toEqual([5]);
    expect(out.toReady).toEqual([]);
  });
});

describe("linkedPullRequests", () => {
  const xref = (source) => ({ event: "cross-referenced", source });

  it("keeps cross-references whose source is a pull request", () => {
    const events = [
      xref({
        type: "issue",
        issue: { number: 7, state: "closed", pull_request: { merged_at: "2026-11-01T00:00:00Z" } },
      }),
      xref({
        type: "issue",
        issue: { number: 8, state: "open", pull_request: { merged_at: null } },
      }),
    ];
    expect(linkedPullRequests(events)).toEqual([pr(7, "closed", true), pr(8, "open", false)]);
  });

  it("ignores a cross-reference from a plain issue", () => {
    const events = [xref({ type: "issue", issue: { number: 9, state: "open" } })];
    expect(linkedPullRequests(events)).toEqual([]);
  });

  it("ignores non cross-referenced events and de-duplicates by number", () => {
    const src = {
      type: "issue",
      issue: { number: 7, state: "open", pull_request: { merged_at: null } },
    };
    expect(linkedPullRequests([{ event: "labeled" }, xref(src), xref(src)])).toHaveLength(1);
  });

  it("throws on a non-array timeline instead of reading it as no PRs", () => {
    expect(() => linkedPullRequests({ message: "Not Found" })).toThrow(/timeline/);
  });
});

describe("formatReport", () => {
  it("prints counts and numbers", () => {
    const text = formatReport({ stateless: [1, 2], toReady: [3], mergedReport: [4], noPr: [] });
    expect(text).toContain("stateless: 2 (#1, #2)");
    expect(text).toContain("has-pr, all PRs closed unmerged -> ready: 1 (#3)");
    expect(text).toContain("has-pr, a PR merged (report only): 1 (#4)");
    expect(text).toContain("has-pr, no linked PR (report only): 0 (none)");
  });
});
