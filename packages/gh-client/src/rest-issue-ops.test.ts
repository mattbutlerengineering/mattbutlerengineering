import { describe, it, expect, vi } from "vitest";
import {
  issueList,
  issueView,
  issueCreate,
  issueComment,
  issueReopen,
  issueClose,
  issueEdit,
} from "./rest-issue-ops.js";
import { parseArgs } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import type { SyncHttp } from "./sync-http.js";

function makeCtx(http: SyncHttp): RestContext {
  return { token: "t", owner: "owner", repo: "repo", http };
}

describe("issueList", () => {
  it("filters out pull requests and maps fields", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify([
        { number: 1, title: "issue", state: "open", labels: [], created_at: "2026-01-01" },
        { number: 2, title: "a pr", state: "open", pull_request: {} },
      ]),
    });
    const result = issueList(
      makeCtx(http),
      parseArgs(["--state", "open", "--json", "number,title"])
    );
    expect(result).toEqual([expect.objectContaining({ number: 1, title: "issue", state: "OPEN" })]);
  });

  it("uses the Search API when --search is given", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({ items: [{ number: 3, title: "found", state: "closed" }] }),
    });
    const result = issueList(
      makeCtx(http),
      parseArgs(["--state", "closed", "--limit", "5", "--search", "label:sentry"])
    );
    expect(result).toEqual([expect.objectContaining({ number: 3, state: "CLOSED" })]);
    expect(http.mock.calls[0][0].url).toContain("/search/issues?q=");
  });
});

describe("issueView", () => {
  it("returns the mapped issue when no extra fields requested", () => {
    const http = vi.fn().mockReturnValue({
      status: 200,
      body: JSON.stringify({ number: 5, title: "x", state: "open" }),
    });
    const result = issueView(makeCtx(http), 5, parseArgs(["--json", "title"]));
    expect(result).toMatchObject({ number: 5, title: "x" });
  });

  it("returns just the comments array for --json comments --jq .comments", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({ status: 200, body: JSON.stringify({ number: 5, title: "x" }) })
      .mockReturnValueOnce({ status: 200, body: JSON.stringify([{ body: "hi" }]) });
    const result = issueView(
      makeCtx(http),
      5,
      parseArgs(["--json", "comments", "--jq", ".comments"])
    );
    expect(result).toEqual([{ body: "hi" }]);
  });

  it("merges comments into the issue object when --jq is absent", () => {
    const http = vi
      .fn()
      .mockReturnValueOnce({ status: 200, body: JSON.stringify({ number: 5, title: "x" }) })
      .mockReturnValueOnce({ status: 200, body: JSON.stringify([{ body: "hi" }]) });
    const result = issueView(makeCtx(http), 5, parseArgs(["--json", "comments"]));
    expect(result).toMatchObject({ number: 5, comments: [{ body: "hi" }] });
  });
});

describe("issueCreate", () => {
  it("posts title/body/labels and returns the created issue URL", () => {
    const http = vi.fn().mockReturnValue({
      status: 201,
      body: JSON.stringify({ html_url: "https://github.com/owner/repo/issues/99" }),
    });
    const url = issueCreate(
      makeCtx(http),
      parseArgs(["--title", "t", "--body", "b", "--label", "audit", "--label", "ready"])
    );
    expect(url).toBe("https://github.com/owner/repo/issues/99");
    const [{ method, body }] = http.mock.calls[0];
    expect(method).toBe("POST");
    expect(JSON.parse(body)).toEqual({ title: "t", body: "b", labels: ["audit", "ready"] });
  });
});

describe("issueComment / issueReopen / issueClose", () => {
  it("issueComment posts a comment body", () => {
    const http = vi.fn().mockReturnValue({ status: 201, body: "{}" });
    issueComment(makeCtx(http), 7, "hello");
    expect(http.mock.calls[0][0].url).toContain("/issues/7/comments");
    expect(JSON.parse(http.mock.calls[0][0].body)).toEqual({ body: "hello" });
  });

  it("issueReopen patches state to open", () => {
    const http = vi.fn().mockReturnValue({ status: 200, body: "{}" });
    issueReopen(makeCtx(http), 3);
    expect(http.mock.calls[0][0].method).toBe("PATCH");
    expect(JSON.parse(http.mock.calls[0][0].body)).toEqual({ state: "open" });
  });

  it("issueClose posts a comment first when --comment is given, then closes", () => {
    const http = vi.fn().mockReturnValue({ status: 200, body: "{}" });
    issueClose(makeCtx(http), 9, parseArgs(["--comment", "done"]));
    expect(http).toHaveBeenCalledTimes(2);
    expect(http.mock.calls[0][0].url).toContain("/comments");
    expect(JSON.parse(http.mock.calls[1][0].body)).toEqual({ state: "closed" });
  });
});

describe("issueEdit (label add/remove)", () => {
  it("batches adds into one POST and issues one DELETE per removal", () => {
    const http = vi.fn().mockReturnValue({ status: 200, body: "{}" });
    issueEdit(
      makeCtx(http),
      10,
      parseArgs([
        "--add-label",
        "has-pr",
        "--remove-label",
        "in-progress",
        "--remove-label",
        "ready",
      ])
    );
    expect(http).toHaveBeenCalledTimes(3);
    expect(http.mock.calls[0][0].method).toBe("POST");
    expect(JSON.parse(http.mock.calls[0][0].body)).toEqual({ labels: ["has-pr"] });
    expect(http.mock.calls[1][0].method).toBe("DELETE");
    expect(http.mock.calls[1][0].url).toContain("/labels/in-progress");
    expect(http.mock.calls[2][0].url).toContain("/labels/ready");
  });

  it("tolerates a 404 when removing a label that was never applied", () => {
    const http = vi.fn().mockReturnValue({ status: 404, body: "{}" });
    expect(() => issueEdit(makeCtx(http), 2, parseArgs(["--remove-label", "ready"]))).not.toThrow();
  });
});
