import { describe, it, expect } from "vitest";
import {
  extractDependsOnNumbers,
  findPromotable,
  runPromote,
  PROMOTION_BLOCKING_LABELS,
} from "../promote-unblocked-issues.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const makeIssue = (overrides = {}) => ({
  number: 1,
  state: "open",
  body: "Depends on: #10",
  labels: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// extractDependsOnNumbers — body parsing
// ---------------------------------------------------------------------------

describe("extractDependsOnNumbers", () => {
  it("extracts a single blocker number", () => {
    expect(extractDependsOnNumbers("Depends on: #6612")).toEqual([6612]);
  });

  it("extracts a blocker number from a markdown list line", () => {
    expect(extractDependsOnNumbers("- Depends on: #6612")).toEqual([6612]);
  });

  it("extracts multiple blocker numbers across separate lines", () => {
    const body = ["## Dependencies", "", "- Depends on: #6612", "- Depends on: #6613"].join("\n");
    expect(extractDependsOnNumbers(body)).toEqual([6612, 6613]);
  });

  it("extracts multiple blocker numbers listed on one line", () => {
    expect(extractDependsOnNumbers("Depends on: #6612, #6613")).toEqual([6612, 6613]);
  });

  it("is case-insensitive", () => {
    expect(extractDependsOnNumbers("depends ON: #6612")).toEqual([6612]);
  });

  it("de-duplicates a repeated blocker number", () => {
    const body = ["Depends on: #6612", "Depends on: #6612"].join("\n");
    expect(extractDependsOnNumbers(body)).toEqual([6612]);
  });

  it("ignores a malformed Depends on line with no issue number", () => {
    expect(extractDependsOnNumbers("Depends on: none")).toEqual([]);
    expect(extractDependsOnNumbers("Depends on: TBD")).toEqual([]);
  });

  it("returns an empty array when the body has no Depends on line", () => {
    expect(extractDependsOnNumbers("Just a plain issue body with no dependencies.")).toEqual([]);
  });

  it("returns an empty array for a missing or non-string body", () => {
    expect(extractDependsOnNumbers(undefined)).toEqual([]);
    expect(extractDependsOnNumbers(null)).toEqual([]);
    expect(extractDependsOnNumbers(42)).toEqual([]);
  });

  it("does not treat unrelated '#N' mentions elsewhere in the body as blockers", () => {
    const body = ["See also #999 for background.", "Depends on: #6612"].join("\n");
    expect(extractDependsOnNumbers(body)).toEqual([6612]);
  });
});

// ---------------------------------------------------------------------------
// findPromotable — pure selection logic
// ---------------------------------------------------------------------------

describe("findPromotable", () => {
  it("promotes an issue whose single blocker is closed", () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: #10" })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result.map((i) => i.number)).toEqual([1]);
  });

  it("does not promote an issue with one blocker still open", () => {
    const issues = [makeIssue({ number: 1, body: "- Depends on: #10\n- Depends on: #11" })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("promotes only once all blockers are closed", () => {
    const issues = [makeIssue({ number: 1, body: "- Depends on: #10\n- Depends on: #11" })];
    const result = findPromotable({ issues, closedNumbers: [10, 11] });
    expect(result.map((i) => i.number)).toEqual([1]);
  });

  it("treats a merged PR-number blocker as closed", () => {
    // closedNumbers is derived from each blocker's issue/PR `state`, which
    // for a pull request is "closed" whether it merged or was closed
    // unmerged — the CLI builds this set from the REST issues endpoint,
    // which returns PRs as closed-state issues too.
    const issues = [makeIssue({ number: 1, body: "Depends on: #6591" })];
    const result = findPromotable({ issues, closedNumbers: [6591] });
    expect(result.map((i) => i.number)).toEqual([1]);
  });

  it("does not promote an issue already labeled ready", () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: #10", labels: [{ name: "ready" }] })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("does not promote an issue already labeled in-progress", () => {
    const issues = [makeIssue({ number: 1, labels: ["in-progress"] })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("does not promote an issue already labeled has-pr", () => {
    const issues = [makeIssue({ number: 1, labels: [{ name: "has-pr" }] })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("does not promote an issue labeled blocked", () => {
    const issues = [makeIssue({ number: 1, labels: [{ name: "blocked" }] })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("does not promote a tracking issue", () => {
    const issues = [makeIssue({ number: 1, labels: [{ name: "tracking" }] })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("leaves an issue with no Depends on line untouched (out of scope)", () => {
    const issues = [makeIssue({ number: 1, body: "No dependency info here." })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("leaves an issue whose only Depends on line is malformed untouched", () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: none" })];
    const result = findPromotable({ issues, closedNumbers: [] });
    expect(result).toEqual([]);
  });

  it("excludes a closed issue even if its blockers are closed", () => {
    const issues = [makeIssue({ number: 1, state: "closed", body: "Depends on: #10" })];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result).toEqual([]);
  });

  it("selects only the qualifying issues out of a mixed list", () => {
    const issues = [
      makeIssue({ number: 1, body: "Depends on: #10" }), // qualifies
      makeIssue({ number: 2, body: "Depends on: #10, #11" }), // blocker #11 still open
      makeIssue({ number: 3, body: "No dependency info." }), // out of scope
      makeIssue({ number: 4, body: "Depends on: #10", labels: [{ name: "ready" }] }), // already ready
    ];
    const result = findPromotable({ issues, closedNumbers: [10] });
    expect(result.map((i) => i.number)).toEqual([1]);
  });

  it("does not mutate the input array", () => {
    const issues = Object.freeze([makeIssue({ number: 1 })]);
    expect(() => findPromotable({ issues, closedNumbers: [10] })).not.toThrow();
  });

  it("returns an empty array for an empty or missing issue list", () => {
    expect(findPromotable({ issues: [], closedNumbers: [] })).toEqual([]);
    expect(findPromotable({ issues: undefined, closedNumbers: [] })).toEqual([]);
  });

  it("exports the blocking-label vocabulary used for the already-queued check", () => {
    expect(PROMOTION_BLOCKING_LABELS).toEqual(
      expect.arrayContaining(["ready", "in-progress", "has-pr", "blocked", "tracking"])
    );
  });
});

// ---------------------------------------------------------------------------
// runPromote — orchestration with injected I/O (unit-tested without the network)
// ---------------------------------------------------------------------------

describe("runPromote", () => {
  it("labels every promotable issue ready and reports what it promoted", async () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: #10" })];
    const labeled = [];
    const promoted = await runPromote({
      listOpenIssues: async () => issues,
      getIssueState: async (number) => (number === 10 ? "closed" : "open"),
      labelReady: async (number) => {
        labeled.push(number);
      },
      log: () => {},
    });
    expect(promoted).toEqual([1]);
    expect(labeled).toEqual([1]);
  });

  it("does not call labelReady in dry-run mode", async () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: #10" })];
    const labeled = [];
    const promoted = await runPromote({
      listOpenIssues: async () => issues,
      getIssueState: async () => "closed",
      labelReady: async (number) => {
        labeled.push(number);
      },
      dryRun: true,
      log: () => {},
    });
    expect(promoted).toEqual([1]);
    expect(labeled).toEqual([]);
  });

  it("only queries blocker state for numbers actually referenced", async () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: #10" })];
    const queried = [];
    await runPromote({
      listOpenIssues: async () => issues,
      getIssueState: async (number) => {
        queried.push(number);
        return "closed";
      },
      labelReady: async () => {},
      log: () => {},
    });
    expect(queried).toEqual([10]);
  });

  it("isolates a labelReady failure on one issue from the rest of the batch", async () => {
    const issues = [
      makeIssue({ number: 1, body: "Depends on: #10" }),
      makeIssue({ number: 2, body: "Depends on: #10" }),
    ];
    const labeled = [];
    const promoted = await runPromote({
      listOpenIssues: async () => issues,
      getIssueState: async () => "closed",
      labelReady: async (number) => {
        if (number === 1) throw new Error("boom");
        labeled.push(number);
      },
      log: () => {},
    });
    expect(promoted).toEqual([2]);
    expect(labeled).toEqual([2]);
  });

  it("does not promote anything when no issue has all blockers closed", async () => {
    const issues = [makeIssue({ number: 1, body: "Depends on: #10" })];
    const promoted = await runPromote({
      listOpenIssues: async () => issues,
      getIssueState: async () => "open",
      labelReady: async () => {
        throw new Error("should not be called");
      },
      log: () => {},
    });
    expect(promoted).toEqual([]);
  });
});
