import { describe, it, expect } from "vitest";
import { buildSearchQuery } from "./rest-search.js";
import { parseArgs } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";

const ctx: RestContext = {
  token: "t",
  owner: "owner",
  repo: "repo",
  http: () => ({ status: 200, body: "" }),
};

describe("buildSearchQuery", () => {
  it("builds an issue search query with repo/is/state qualifiers", () => {
    const parsed = parseArgs(["--state", "closed", "--limit", "200"]);
    const query = buildSearchQuery(ctx, "issue", parsed, "label:sentry label:sentry-timeout");
    expect(query).toBe("repo:owner/repo is:issue state:closed label:sentry label:sentry-timeout");
  });

  it("omits the state qualifier for state:all", () => {
    const parsed = parseArgs(["--state", "all"]);
    const query = buildSearchQuery(ctx, "pr", parsed, '"revert: #38" in:title');
    expect(query).toBe('repo:owner/repo is:pr "revert: #38" in:title');
  });

  it("adds a label qualifier per --label flag", () => {
    const parsed = parseArgs(["--label", "a", "--label", "b"]);
    const query = buildSearchQuery(ctx, "issue", parsed, "term");
    expect(query).toBe("repo:owner/repo is:issue label:a label:b term");
  });
});
