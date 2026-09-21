import { describe, it, expect, vi } from "vitest";
import { prList, prView, prCreate } from "./rest-pr-ops.js";
import { parseArgs } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import type { SyncHttp } from "./sync-http.js";

function makeCtx(http: SyncHttp): RestContext {
  return { token: "t", owner: "owner", repo: "repo", http };
}

describe("prList", () => {
  it("maps state OPEN/CLOSED/MERGED and headRefName without extra requests when stats aren't requested", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify([
        { number: 1, title: "a", state: "open", head: { ref: "fix/a" } },
        { number: 2, title: "b", state: "closed", merged_at: "2026-01-01T00:00:00Z" },
        { number: 3, title: "c", state: "closed" },
      ]),
    });
    const result = prList(
      makeCtx(http),
      parseArgs(["--state", "all", "--json", "number,state,headRefName"])
    );
    expect(result).toEqual([
      expect.objectContaining({ number: 1, state: "OPEN", headRefName: "fix/a" }),
      expect.objectContaining({ number: 2, state: "MERGED" }),
      expect.objectContaining({ number: 3, state: "CLOSED" }),
    ]);
    expect(http).toHaveBeenCalledTimes(1);
  });

  it("enriches with real commit counts when --json requests commits (queueEfficiency path)", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify([{ number: 1, title: "a", state: "open" }]),
      })
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify({ number: 1, additions: 10, deletions: 2 }),
      })
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify([
          { sha: "a", commit: { message: "fix: a" } },
          { sha: "b", commit: { message: "fix: b" } },
        ]),
      });

    const result = prList(
      makeCtx(http),
      parseArgs(["--state", "all", "--json", "number,commits,additions,deletions"])
    ) as { commits: Record<string, unknown>[] }[];

    expect(result[0]).toMatchObject({ number: 1, additions: 10, deletions: 2 });
    // Shaped like GraphQL here too (#4706) — commitCount consumers read
    // `.length`, but anything reading a field must not get the raw REST shape.
    expect(result[0].commits).toEqual([
      expect.objectContaining({ oid: "a", messageHeadline: "fix: a" }),
      expect.objectContaining({ oid: "b", messageHeadline: "fix: b" }),
    ]);
  });

  it("uses the Search API and a repo:owner qualifier when --search is given", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({ items: [{ number: 4, title: "revert", state: "closed" }] }),
    });
    const result = prList(
      makeCtx(http),
      parseArgs([
        "--search",
        '"revert: #1" in:title',
        "--state",
        "all",
        "--json",
        "number,title,state",
      ])
    );
    expect(result).toEqual([expect.objectContaining({ number: 4, state: "CLOSED" })]);
    expect(http.mock.calls[0][0].url).toContain("/search/issues?q=");
  });
});

describe("prView", () => {
  it("maps a plain PR view", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({ number: 1, title: "t", state: "open", head: { ref: "x" } }),
    });
    const result = prView(makeCtx(http), 1, parseArgs(["--json", "title,headRefName"]));
    expect(result).toMatchObject({ title: "t", headRefName: "x" });
  });

  it("maps files, renaming filename to path", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({ status: 200, body: JSON.stringify({ number: 1, title: "t" }) })
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify([{ filename: "src/x.ts", additions: 1, deletions: 0 }]),
      });
    const result = prView(makeCtx(http), 1, parseArgs(["--json", "files"])) as { files: unknown[] };
    expect(result.files).toEqual([{ path: "src/x.ts", additions: 1, deletions: 0 }]);
  });
});

// ── --json commits / reviews shaping (#4706) ─────────────

describe("prView --json commits", () => {
  const REST_COMMITS = [
    {
      sha: "9d60e0d",
      commit: {
        author: {
          name: "Matt Butler",
          email: "mattwbutler@gmail.com",
          date: "2026-07-09T19:31:46Z",
        },
        message: "refactor(hospitality): one deposit-decision module\n\nCloses #3236",
      },
      author: { login: "Matt-Butler" },
    },
  ];

  it("returns GraphQL-shaped commits, not the raw REST objects (the #3250 repro)", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({ status: 200, body: JSON.stringify({ number: 3250, title: "t" }) })
      .mockReturnValueOnce({ status: 200, body: JSON.stringify(REST_COMMITS) });

    const result = prView(makeCtx(http), 3250, parseArgs(["--json", "commits"])) as {
      commits: Record<string, unknown>[];
    };

    expect(result.commits).toEqual([
      {
        oid: "9d60e0d",
        messageHeadline: "refactor(hospitality): one deposit-decision module",
        messageBody: "Closes #3236",
        authoredDate: "2026-07-09T19:31:46Z",
        committedDate: undefined,
        authors: [{ login: "Matt-Butler", name: "Matt Butler", email: "mattwbutler@gmail.com" }],
      },
    ]);
  });
});

describe("prView --json reviews", () => {
  it("fetches and maps reviews so review-comment counts aren't silently dropped", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({ status: 200, body: JSON.stringify({ number: 1, title: "t" }) })
      .mockReturnValueOnce({
        status: 200,
        body: JSON.stringify([
          {
            id: 9,
            node_id: "PRR_1",
            user: { login: "mattbutlerengineering" },
            body: "needs a test",
            state: "CHANGES_REQUESTED",
            submitted_at: "2026-07-09T20:00:00Z",
            author_association: "OWNER",
          },
        ]),
      });

    const result = prView(makeCtx(http), 1, parseArgs(["--json", "reviews"])) as {
      reviews: Record<string, unknown>[];
    };

    expect(http.mock.calls[1][0].url).toContain("/pulls/1/reviews");
    expect(result.reviews).toEqual([
      {
        id: "PRR_1",
        author: { login: "mattbutlerengineering" },
        authorAssociation: "OWNER",
        body: "needs a test",
        state: "CHANGES_REQUESTED",
        submittedAt: "2026-07-09T20:00:00Z",
      },
    ]);
  });

  it("does not request reviews when --json never asked for them", () => {
    const http = vi
      .fn()
      .mockReturnValue({ status: 200, body: JSON.stringify({ number: 1, title: "t" }) });

    prView(makeCtx(http), 1, parseArgs(["--json", "title"]));

    expect(http).toHaveBeenCalledTimes(1);
  });
});

describe("prCreate", () => {
  it("resolves head from git and base from the repo default branch, then applies labels", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({ status: 200, body: JSON.stringify({ default_branch: "main" }) })
      .mockReturnValueOnce({
        status: 201,
        body: JSON.stringify({ number: 42, html_url: "https://github.com/owner/repo/pull/42" }),
      })
      .mockReturnValueOnce({ status: 200, body: "{}" });
    const exec = vi.fn().mockReturnValue("chaos/branch\n");

    const url = prCreate(
      makeCtx(http),
      parseArgs(["--title", "t", "--body", "b", "--label", "chaos-audit"]),
      { exec }
    );

    expect(url).toBe("https://github.com/owner/repo/pull/42");
    expect(JSON.parse(http.mock.calls[1][0].body)).toEqual({
      title: "t",
      body: "b",
      head: "chaos/branch",
      base: "main",
    });
    expect(http.mock.calls[2][0].url).toContain("/issues/42/labels");
  });
});
