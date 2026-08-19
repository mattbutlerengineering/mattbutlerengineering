import type { ParsedArgs } from "./rest-args.js";
import { flag, flagAll, wantsJsonField } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import { apiRequest } from "./rest-http.js";
import { fetchAllPages } from "./rest-paginate.js";
import { buildSearchQuery } from "./rest-search.js";
import type { RawIssue } from "./rest-mappers.js";
import { mapIssue } from "./rest-mappers.js";

function issuesPath(ctx: RestContext): string {
  return `/repos/${ctx.owner}/${ctx.repo}/issues`;
}

/** True for a REST "issue" item that is actually a pull request. */
function isPullRequest(item: RawIssue): boolean {
  return "pull_request" in item;
}

/**
 * GitHub's REST `/issues` endpoint mixes pull requests into the same list, so
 * paginating on raw item count (like {@link fetchAllPages}) and filtering PRs
 * out afterward silently undercounts real issues whenever PR volume is high
 * in the raw feed — a page can be entirely PRs and contribute zero issues
 * toward `limit`. This keeps fetching pages, counting only non-PR items
 * toward `limit`, until enough real issues are collected or the API is
 * exhausted (#4244 — this undercount skewed the `issues` sensor's
 * `closure_rate`, whose 7-day window shrank to whatever few real issues
 * survived a PR-heavy raw fetch).
 */
function fetchIssuePages(ctx: RestContext, basePath: string, limit: number): RawIssue[] {
  const results: RawIssue[] = [];
  const separator = basePath.includes("?") ? "&" : "?";
  const perPage = 100;

  for (let page = 1; results.length < limit; page++) {
    const { json } = apiRequest(
      ctx,
      "GET",
      `${basePath}${separator}per_page=${perPage}&page=${page}`
    );
    const pageItems = (json ?? []) as RawIssue[];
    if (!Array.isArray(pageItems) || pageItems.length === 0) break;

    for (const item of pageItems) {
      if (!isPullRequest(item)) results.push(item);
    }
    if (pageItems.length < perPage) break;
  }

  return results.slice(0, limit);
}

export function issueList(ctx: RestContext, parsed: ParsedArgs): unknown[] {
  const limit = Number(flag(parsed, "limit") ?? "30");
  const search = flag(parsed, "search");

  if (search !== undefined) {
    const query = buildSearchQuery(ctx, "issue", parsed, search);
    const items = fetchAllPages(
      ctx,
      `/search/issues?q=${encodeURIComponent(query)}`,
      limit,
      "items"
    );
    return (items as RawIssue[]).map(mapIssue);
  }

  const params = new URLSearchParams({ state: flag(parsed, "state") ?? "open" });
  const labels = flagAll(parsed, "label");
  if (labels.length > 0) params.set("labels", labels.join(","));

  const items = fetchIssuePages(ctx, `${issuesPath(ctx)}?${params}`, limit);
  return items.map(mapIssue);
}

/**
 * `gh issue view <n> --json comments --jq .comments` is the one `--jq` shape
 * used in this codebase (`scripts/process-metrics.mjs`); it narrows the
 * printed JSON to just the comments array, so we mirror that exactly rather
 * than implementing a general jq interpreter.
 */
export function issueView(ctx: RestContext, number: number, parsed: ParsedArgs): unknown {
  const { json } = apiRequest(ctx, "GET", `${issuesPath(ctx)}/${number}`);
  const mapped = mapIssue(json as RawIssue);
  if (!wantsJsonField(parsed, "comments")) return mapped;

  const comments = fetchAllPages(ctx, `${issuesPath(ctx)}/${number}/comments`, 100);
  if (flag(parsed, "jq") === ".comments") return comments;
  return { ...mapped, comments };
}

export function issueCreate(ctx: RestContext, parsed: ParsedArgs): string {
  const labels = flagAll(parsed, "label");
  const { json } = apiRequest(ctx, "POST", issuesPath(ctx), {
    title: flag(parsed, "title") ?? "",
    body: flag(parsed, "body") ?? "",
    ...(labels.length > 0 ? { labels } : {}),
  });
  return (json as { html_url: string }).html_url;
}

export function issueComment(ctx: RestContext, number: number, body: string): void {
  apiRequest(ctx, "POST", `${issuesPath(ctx)}/${number}/comments`, { body });
}

export function issueReopen(ctx: RestContext, number: number): void {
  apiRequest(ctx, "PATCH", `${issuesPath(ctx)}/${number}`, { state: "open" });
}

export function issueClose(ctx: RestContext, number: number, parsed: ParsedArgs): void {
  const comment = flag(parsed, "comment");
  if (comment) issueComment(ctx, number, comment);
  apiRequest(ctx, "PATCH", `${issuesPath(ctx)}/${number}`, { state: "closed" });
}

/** Backs both the public `issue.edit` facet and `label.apply` (add/remove-label flags). */
export function issueEdit(ctx: RestContext, number: number, parsed: ParsedArgs): void {
  const toAdd = flagAll(parsed, "add-label");
  const toRemove = flagAll(parsed, "remove-label");

  if (toAdd.length > 0) {
    apiRequest(ctx, "POST", `${issuesPath(ctx)}/${number}/labels`, { labels: toAdd });
  }
  for (const name of toRemove) {
    apiRequest(
      ctx,
      "DELETE",
      `${issuesPath(ctx)}/${number}/labels/${encodeURIComponent(name)}`,
      undefined,
      {
        ignoreStatuses: [404],
      }
    );
  }
}
