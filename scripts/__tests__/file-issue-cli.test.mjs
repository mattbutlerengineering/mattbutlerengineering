import { describe, it, expect, vi } from "vitest";
import { parseArgs, findPriorIssueNumber, runFileIssueCli } from "../lib/file-issue-cli.mjs";

describe("parseArgs", () => {
  it("parses a minimal request", () => {
    const opts = parseArgs([
      "--title",
      "Something broke",
      "--body",
      "Details here.",
      "--dedupe-key",
      "example-key",
    ]);

    expect(opts).toEqual({
      title: "Something broke",
      body: "Details here.",
      bodyFile: null,
      labels: [],
      dedupeKey: "example-key",
      searchLabels: [],
      searchState: "open",
      contains: null,
      searchText: null,
      commentBody: null,
      commentBodyFile: null,
    });
  });

  it("collects repeated --label and --search-label flags in order", () => {
    const opts = parseArgs([
      "--title",
      "t",
      "--body",
      "b",
      "--dedupe-key",
      "k",
      "--label",
      "ci-fix",
      "--label",
      "ready",
      "--search-label",
      "ci-fix",
    ]);

    expect(opts.labels).toEqual(["ci-fix", "ready"]);
    expect(opts.searchLabels).toEqual(["ci-fix"]);
  });

  it("accepts --body-file instead of --body", () => {
    const opts = parseArgs(["--title", "t", "--body-file", "/tmp/body.md", "--dedupe-key", "k"]);

    expect(opts.bodyFile).toBe("/tmp/body.md");
    expect(opts.body).toBeNull();
  });

  it("accepts --search-state, --contains, and --search-text", () => {
    const opts = parseArgs([
      "--title",
      "t",
      "--body",
      "b",
      "--dedupe-key",
      "k",
      "--search-state",
      "all",
      "--contains",
      "2026-W31",
      "--search-text",
      "some query",
    ]);

    expect(opts.searchState).toBe("all");
    expect(opts.contains).toBe("2026-W31");
    expect(opts.searchText).toBe("some query");
  });

  it("accepts --comment-body and --comment-body-file", () => {
    const withInline = parseArgs([
      "--title",
      "t",
      "--body",
      "b",
      "--dedupe-key",
      "k",
      "--comment-body",
      "comment text",
    ]);
    expect(withInline.commentBody).toBe("comment text");
    expect(withInline.commentBodyFile).toBeNull();

    const withFile = parseArgs([
      "--title",
      "t",
      "--body",
      "b",
      "--dedupe-key",
      "k",
      "--comment-body-file",
      "/tmp/comment.md",
    ]);
    expect(withFile.commentBodyFile).toBe("/tmp/comment.md");
    expect(withFile.commentBody).toBeNull();
  });

  it("throws when --title is missing", () => {
    expect(() => parseArgs(["--body", "b", "--dedupe-key", "k"])).toThrow(/--title/);
  });

  it("throws when neither --body nor --body-file is given", () => {
    expect(() => parseArgs(["--title", "t", "--dedupe-key", "k"])).toThrow(/--body/);
  });

  it("throws when --dedupe-key is missing", () => {
    expect(() => parseArgs(["--title", "t", "--body", "b"])).toThrow(/--dedupe-key/);
  });

  it("throws on an unknown flag", () => {
    expect(() =>
      parseArgs(["--title", "t", "--body", "b", "--dedupe-key", "k", "--bogus", "x"])
    ).toThrow(/Unknown flag/);
  });
});

describe("findPriorIssueNumber", () => {
  it("returns null when there are no candidate issues", () => {
    expect(findPriorIssueNumber([], {})).toBeNull();
  });

  it("returns the first candidate's number when no contains filter is given", () => {
    const issues = [
      { number: 5, title: "foo" },
      { number: 9, title: "bar" },
    ];
    expect(findPriorIssueNumber(issues, {})).toBe(5);
  });

  it("filters by title substring when contains is given", () => {
    const issues = [
      { number: 5, title: "AI audit trail: 2026-W20" },
      { number: 9, title: "AI audit trail: 2026-W31" },
    ];
    expect(findPriorIssueNumber(issues, { contains: "2026-W31" })).toBe(9);
  });

  it("returns null when contains matches nothing", () => {
    const issues = [{ number: 5, title: "AI audit trail: 2026-W20" }];
    expect(findPriorIssueNumber(issues, { contains: "2026-W31" })).toBeNull();
  });
});

/** Fake deps for runFileIssueCli — no real gh/fs calls. */
function fakeDeps(overrides = {}) {
  return {
    readFile: vi.fn(() => "body from file"),
    searchIssues: vi.fn(() => []),
    getIssueState: vi.fn(() => "missing"),
    createIssue: vi.fn(() => 101),
    reopenIssue: vi.fn(),
    commentOnIssue: vi.fn(),
    ...overrides,
  };
}

describe("runFileIssueCli", () => {
  it("creates a fresh issue when no --search-label is given (no dedup)", () => {
    const deps = fakeDeps({ createIssue: vi.fn(() => 42) });
    const result = runFileIssueCli(
      ["--title", "Broke", "--body", "Details", "--dedupe-key", "k", "--label", "ci-fix"],
      deps
    );

    expect(result).toEqual({ action: "create", issueNumber: 42 });
    expect(deps.searchIssues).not.toHaveBeenCalled();
    expect(deps.createIssue).toHaveBeenCalledWith("Broke", "Details", ["ci-fix"]);
  });

  it("reads the body from --body-file when given", () => {
    const deps = fakeDeps();
    runFileIssueCli(["--title", "Broke", "--body-file", "/tmp/x.md", "--dedupe-key", "k"], deps);

    expect(deps.readFile).toHaveBeenCalledWith("/tmp/x.md");
    expect(deps.createIssue).toHaveBeenCalledWith("Broke", "body from file", []);
  });

  it("searches for a prior issue and skips when an open match exists", () => {
    const deps = fakeDeps({
      searchIssues: vi.fn(() => [{ number: 7, title: "Circuit breaker tripped" }]),
      getIssueState: vi.fn(() => "open"),
    });

    const result = runFileIssueCli(
      [
        "--title",
        "Circuit breaker tripped - deploys blocked",
        "--body",
        "b",
        "--dedupe-key",
        "circuit-breaker-tripped",
        "--search-label",
        "ci-fix,blocking",
        "--search-text",
        "Circuit breaker tripped",
      ],
      deps
    );

    expect(result).toEqual({ action: "skip", issueNumber: 7 });
    expect(deps.searchIssues).toHaveBeenCalledWith({
      labels: ["ci-fix,blocking"],
      state: "open",
      searchText: "Circuit breaker tripped",
    });
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("reopens a prior issue found closed when search-state is all", () => {
    const deps = fakeDeps({
      searchIssues: vi.fn(() => [{ number: 12, title: "Database backup verification failed" }]),
      getIssueState: vi.fn(() => "closed"),
    });

    const result = runFileIssueCli(
      [
        "--title",
        "Database backup verification failed",
        "--body",
        "b",
        "--dedupe-key",
        "backup-verify-failure",
        "--search-label",
        "ci-fix",
        "--search-state",
        "all",
        "--contains",
        "Database backup verification failed",
      ],
      deps
    );

    expect(result).toEqual({ action: "reopen", issueNumber: 12 });
    expect(deps.reopenIssue).toHaveBeenCalledWith(12);
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("creates fresh when a search is configured but finds no match", () => {
    const deps = fakeDeps({ searchIssues: vi.fn(() => []), createIssue: vi.fn(() => 55) });

    const result = runFileIssueCli(
      ["--title", "t", "--body", "b", "--dedupe-key", "k", "--search-label", "ci-fix"],
      deps
    );

    expect(result).toEqual({ action: "create", issueNumber: 55 });
  });

  it("comments on the prior open issue instead of silently skipping when --comment-body is given (#5084)", () => {
    const deps = fakeDeps({
      searchIssues: vi.fn(() => [
        { number: 7, title: "[nightly-compliance 2026-09-01] Drift detected" },
      ]),
      getIssueState: vi.fn(() => "open"),
    });

    const result = runFileIssueCli(
      [
        "--title",
        "[nightly-compliance 2026-09-02] Drift detected",
        "--body",
        "b",
        "--dedupe-key",
        "nightly-compliance-drift-abc123",
        "--search-label",
        "meta-improvement",
        "--search-text",
        "abc123",
        "--comment-body",
        "Drift also detected on 2026-09-02 — see run.",
      ],
      deps
    );

    expect(result).toEqual({ action: "skip", issueNumber: 7, commented: true });
    expect(deps.commentOnIssue).toHaveBeenCalledWith(
      7,
      "Drift also detected on 2026-09-02 — see run."
    );
    expect(deps.createIssue).not.toHaveBeenCalled();
  });

  it("reads the comment body from --comment-body-file when given", () => {
    const deps = fakeDeps({
      searchIssues: vi.fn(() => [{ number: 7, title: "t" }]),
      getIssueState: vi.fn(() => "open"),
      readFile: vi.fn((path) =>
        path === "/tmp/comment.md" ? "comment from file" : "body from file"
      ),
    });

    runFileIssueCli(
      [
        "--title",
        "t",
        "--body",
        "b",
        "--dedupe-key",
        "k",
        "--search-label",
        "meta-improvement",
        "--comment-body-file",
        "/tmp/comment.md",
      ],
      deps
    );

    expect(deps.commentOnIssue).toHaveBeenCalledWith(7, "comment from file");
  });

  it("does not comment when the result is a fresh create, even if --comment-body is given", () => {
    const deps = fakeDeps({ createIssue: vi.fn(() => 55) });

    const result = runFileIssueCli(
      [
        "--title",
        "t",
        "--body",
        "b",
        "--dedupe-key",
        "k",
        "--comment-body",
        "should not be posted",
      ],
      deps
    );

    expect(result).toEqual({ action: "create", issueNumber: 55 });
    expect(deps.commentOnIssue).not.toHaveBeenCalled();
  });

  it("does not comment when no --comment-body/--comment-body-file is given, even on a skip", () => {
    const deps = fakeDeps({
      searchIssues: vi.fn(() => [{ number: 7, title: "t" }]),
      getIssueState: vi.fn(() => "open"),
    });

    const result = runFileIssueCli(
      ["--title", "t", "--body", "b", "--dedupe-key", "k", "--search-label", "meta-improvement"],
      deps
    );

    expect(result).toEqual({ action: "skip", issueNumber: 7 });
    expect(deps.commentOnIssue).not.toHaveBeenCalled();
  });

  it("treats a search failure as 'no prior found' and still creates — every original inline dedup implementation failed open (bash's default non-strict error handling on a failed `gh issue list`), not closed", () => {
    const deps = fakeDeps({
      searchIssues: vi.fn(() => {
        throw new Error("gh: rate limited");
      }),
      createIssue: vi.fn(() => 55),
    });

    const result = runFileIssueCli(
      ["--title", "t", "--body", "b", "--dedupe-key", "k", "--search-label", "ci-fix"],
      deps
    );

    expect(result).toEqual({ action: "create", issueNumber: 55 });
  });
});
