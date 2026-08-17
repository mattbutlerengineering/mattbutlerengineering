import { describe, it, expect } from "vitest";
import { mapIssue, mapPr, mapPrFile, mapLabel, mapWorkflowRun } from "./rest-mappers.js";

describe("mapIssue", () => {
  it("maps REST issue fields to gh-CLI camelCase names", () => {
    const mapped = mapIssue({
      number: 5,
      title: "bug",
      state: "open",
      state_reason: null,
      labels: [{ name: "ready", color: "abc123", description: null }, "bug"],
      created_at: "2026-01-01T00:00:00Z",
      closed_at: null,
      user: { login: "octocat" },
    });

    expect(mapped).toMatchObject({
      number: 5,
      title: "bug",
      state: "OPEN",
      labels: [{ name: "ready", color: "abc123", description: null }, { name: "bug" }],
      createdAt: "2026-01-01T00:00:00Z",
      closedAt: null,
      author: { login: "octocat" },
    });
  });
});

describe("mapPr", () => {
  it("maps an open PR", () => {
    const mapped = mapPr({ number: 1, title: "fix", state: "open", head: { ref: "fix/x" } });
    expect(mapped.state).toBe("OPEN");
    expect(mapped.headRefName).toBe("fix/x");
  });

  it("maps a merged PR to state MERGED regardless of raw.state", () => {
    const mapped = mapPr({
      number: 1,
      title: "fix",
      state: "closed",
      merged_at: "2026-01-02T00:00:00Z",
    });
    expect(mapped.state).toBe("MERGED");
    expect(mapped.mergedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("maps a closed-not-merged PR to state CLOSED", () => {
    const mapped = mapPr({ number: 1, title: "fix", state: "closed", merged_at: null });
    expect(mapped.state).toBe("CLOSED");
  });
});

describe("mapPrFile", () => {
  it("renames filename to path", () => {
    expect(mapPrFile({ filename: "src/x.ts", additions: 1, deletions: 2 })).toEqual({
      path: "src/x.ts",
      additions: 1,
      deletions: 2,
    });
  });
});

describe("mapLabel", () => {
  it("maps label fields", () => {
    expect(mapLabel({ name: "security", color: "red" })).toMatchObject({
      name: "security",
      color: "red",
    });
  });
});

describe("mapWorkflowRun", () => {
  it("maps workflow run fields", () => {
    const mapped = mapWorkflowRun({
      id: 42,
      status: "completed",
      conclusion: "success",
      created_at: "2026-01-01T00:00:00Z",
      name: "CI",
      head_branch: "main",
      head_sha: "abc123",
    });
    expect(mapped).toEqual({
      databaseId: 42,
      status: "completed",
      conclusion: "success",
      createdAt: "2026-01-01T00:00:00Z",
      name: "CI",
      headBranch: "main",
      headSha: "abc123",
    });
  });
});
