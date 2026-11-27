import { describe, it, expect } from "vitest";
import {
  groupCrossBranchFailures,
  extractFailedTests,
  buildFailureRecord,
  buildIssueTitle,
  buildIssueBody,
  titleTestId,
  shouldSuppressReopen,
  mergeGroupsByLocation,
} from "../e2e-cross-branch-red.mjs";

const rec = (branch, runId, failed, createdAt = "2026-11-26T10:00:00Z") => ({
  branch,
  sha: "abc",
  runId,
  createdAt,
  failed,
});
const T = { file: "a.spec.ts", line: 10, title: "does a thing" };

describe("groupCrossBranchFailures", () => {
  it("flags a test failing on 3 distinct branches", () => {
    const out = groupCrossBranchFailures([rec("a", 1, [T]), rec("b", 2, [T]), rec("c", 3, [T])]);
    expect(out).toHaveLength(1);
    expect(out[0].key).toBe("a.spec.ts:10 does a thing");
    expect(out[0].branches).toEqual(["a", "b", "c"]);
    expect(out[0].runIds).toEqual([1, 2, 3]);
  });

  it("does not flag 2 distinct branches (default threshold 3)", () => {
    expect(groupCrossBranchFailures([rec("a", 1, [T]), rec("b", 2, [T])])).toEqual([]);
  });

  it("flags 2 branches when minBranches is 2", () => {
    const out = groupCrossBranchFailures([rec("a", 1, [T]), rec("b", 2, [T])], { minBranches: 2 });
    expect(out).toHaveLength(1);
  });

  it("counts one branch failing 5 times once", () => {
    const records = [1, 2, 3, 4, 5].map((n) => rec("a", n, [T]));
    expect(groupCrossBranchFailures(records)).toEqual([]);
  });

  it("counts automation and changeset-release branches like any other", () => {
    const out = groupCrossBranchFailures([
      rec("automation/x", 1, [T]),
      rec("changeset-release/main", 2, [T]),
      rec("feat/y", 3, [T]),
    ]);
    expect(out).toHaveLength(1);
  });

  it("tracks first and last seen and ignores resultsMissing records", () => {
    const out = groupCrossBranchFailures([
      rec("a", 1, [T], "2026-11-26T12:00:00Z"),
      rec("b", 2, [T], "2026-11-26T08:00:00Z"),
      rec("c", 3, [T], "2026-11-26T10:00:00Z"),
      { ...rec("d", 4, []), resultsMissing: true },
    ]);
    expect(out[0].firstSeen).toBe("2026-11-26T08:00:00Z");
    expect(out[0].lastSeen).toBe("2026-11-26T12:00:00Z");
  });

  it("keeps different tests separate", () => {
    const U = { file: "b.spec.ts", line: 1, title: "other" };
    const out = groupCrossBranchFailures([rec("a", 1, [T, U]), rec("b", 2, [T]), rec("c", 3, [T])]);
    expect(out.map((g) => g.key)).toEqual(["a.spec.ts:10 does a thing"]);
  });
});

describe("extractFailedTests / buildFailureRecord", () => {
  const results = {
    suites: [
      {
        file: "a.spec.ts",
        specs: [],
        suites: [
          {
            specs: [
              {
                title: "bad",
                file: "a.spec.ts",
                line: 5,
                tests: [{ status: "unexpected" }],
              },
              { title: "flaky", file: "a.spec.ts", line: 9, tests: [{ status: "flaky" }] },
              { title: "ok", file: "a.spec.ts", line: 12, tests: [{ status: "expected" }] },
            ],
          },
        ],
      },
    ],
  };

  it("keeps only unexpected results, walking nested suites", () => {
    expect(extractFailedTests(results)).toEqual([{ file: "a.spec.ts", line: 5, title: "bad" }]);
  });

  it("builds a record with metadata", () => {
    expect(buildFailureRecord({ branch: "b", sha: "s", runId: 7, results })).toEqual({
      branch: "b",
      sha: "s",
      runId: 7,
      failed: [{ file: "a.spec.ts", line: 5, title: "bad" }],
    });
  });

  it("flags a missing results file", () => {
    expect(buildFailureRecord({ branch: "b", sha: "s", runId: 7, results: null })).toEqual({
      branch: "b",
      sha: "s",
      runId: 7,
      failed: [],
      resultsMissing: true,
    });
  });
});

describe("mergeGroupsByLocation", () => {
  const en = { file: "p.spec.ts", line: 7, title: "books (en-US)" };
  const fr = { file: "p.spec.ts", line: 7, title: "books (fr-CA)" };
  const records = [
    rec("a", 1, [en, fr]),
    rec("b", 2, [en]),
    rec("c", 3, [en, fr]),
    rec("d", 4, [fr]),
    rec("e", 5, [fr]),
  ];

  it("turns two titles on one file:line into one group (one filing request)", () => {
    const merged = mergeGroupsByLocation(groupCrossBranchFailures(records));
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("p.spec.ts:7");
    expect(merged[0].titles).toEqual(["books (en-US)", "books (fr-CA)"]);
    expect(merged[0].branches).toEqual(["a", "b", "c", "d", "e"]);
    expect(merged[0].runIds).toEqual([1, 2, 3, 4, 5]);
    expect(merged[0].keys).toEqual(["p.spec.ts:7 books (en-US)", "p.spec.ts:7 books (fr-CA)"]);
  });

  it("lists every failing title in the body", () => {
    const [merged] = mergeGroupsByLocation(groupCrossBranchFailures(records));
    const body = buildIssueBody(merged, "o/r");
    expect(body).toContain("books (en-US)");
    expect(body).toContain("books (fr-CA)");
    expect(buildIssueTitle(merged)).toBe(
      "ci-fix: E2E test red on 5 unrelated PR branches: p.spec.ts:7"
    );
  });
});

describe("issue title and body", () => {
  const group = {
    key: "a.spec.ts:10 does a thing",
    id: "a.spec.ts:10",
    keys: ["a.spec.ts:10 does a thing"],
    file: "a.spec.ts",
    line: 10,
    titles: ["does a thing"],
    branches: ["a", "b", "c"],
    runIds: [1, 2, 3],
    firstSeen: "x",
    lastSeen: "y",
  };

  it("uses a deterministic title", () => {
    expect(buildIssueTitle(group)).toBe(
      "ci-fix: E2E test red on 3 unrelated PR branches: a.spec.ts:10"
    );
  });

  it("dedupes on file:line regardless of branch count", () => {
    expect(titleTestId(buildIssueTitle(group))).toBe("a.spec.ts:10");
    expect(titleTestId("ci-fix: E2E test red on 7 unrelated PR branches: a.spec.ts:10")).toBe(
      "a.spec.ts:10"
    );
    expect(titleTestId("something else")).toBeNull();
  });

  it("body lists branches, run links and says red for everyone", () => {
    const body = buildIssueBody(group, "o/r");
    expect(body).toContain("`a`");
    expect(body).toContain("https://github.com/o/r/actions/runs/2");
    expect(body).toContain("does a thing");
    expect(body).toMatch(/red for everyone/);
  });
});

describe("shouldSuppressReopen", () => {
  const KEY = "a.spec.ts:10 does a thing";
  const closed = { number: 5, state: "CLOSED", closedAt: "2026-11-26T12:00:00Z" };
  const before = "2026-11-26T10:00:00Z";
  const after = "2026-11-26T14:00:00Z";
  const three = (t) => [rec("a", 1, [T], t), rec("b", 2, [T], t), rec("c", 3, [T], t)];

  it("suppresses when every failure predates closedAt", () => {
    expect(shouldSuppressReopen(closed, KEY, three(before))).toBe(true);
  });

  it("allows reopen when 3 branches failed after closedAt", () => {
    expect(shouldSuppressReopen(closed, KEY, three(after))).toBe(false);
  });

  it("suppresses when only 1 branch re-broke after closedAt", () => {
    const records = [...three(before), rec("d", 4, [T], after)];
    expect(shouldSuppressReopen(closed, KEY, records)).toBe(true);
  });

  it("does not suppress an open issue (fileIssue already skips it)", () => {
    expect(shouldSuppressReopen({ ...closed, state: "OPEN" }, KEY, three(before))).toBe(false);
  });

  it("does not suppress when there is no prior issue", () => {
    expect(shouldSuppressReopen(null, KEY, three(before))).toBe(false);
  });
});
