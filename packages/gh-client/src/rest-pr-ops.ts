import type { ParsedArgs } from "./rest-args.js";
import { flag, flagAll, wantsJsonField } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import { apiRequest } from "./rest-http.js";
import { fetchAllPages } from "./rest-paginate.js";
import { buildSearchQuery } from "./rest-search.js";
import { currentBranch } from "./git-branch.js";
import type { RawPr, RawPrFile } from "./rest-mappers.js";
import { mapPr, mapPrFile } from "./rest-mappers.js";

function pullsPath(ctx: RestContext): string {
  return `/repos/${ctx.owner}/${ctx.repo}/pulls`;
}

function prNumberOf(item: unknown): number {
  return (item as { number: number }).number;
}

/**
 * Adds accurate `additions`/`deletions`/`commits` to a mapped PR. The bulk
 * list endpoint omits these (they're single-PR-detail-only fields), so this
 * costs one extra request per matched PR — only paid when a caller actually
 * asks for one of these fields (queueEfficiency's first-pass-success-rate
 * calculation is the reason this exists: without it every REST-sourced PR
 * would default to `commitCount: 1` and silently misreport the metric).
 */
function enrichPrStats(
  ctx: RestContext,
  number: number,
  mapped: Record<string, unknown>,
  wantsCommits: boolean
): Record<string, unknown> {
  const { json } = apiRequest(ctx, "GET", `${pullsPath(ctx)}/${number}`);
  const detail = json as RawPr;
  const withStats = { ...mapped, additions: detail.additions, deletions: detail.deletions };
  if (!wantsCommits) return withStats;

  const commits = fetchAllPages(ctx, `${pullsPath(ctx)}/${number}/commits`, 100);
  return { ...withStats, commits };
}

export function prList(ctx: RestContext, parsed: ParsedArgs): unknown[] {
  const limit = Number(flag(parsed, "limit") ?? "30");
  const search = flag(parsed, "search");
  const wantsCommits = wantsJsonField(parsed, "commits");
  const wantsStats =
    wantsCommits || wantsJsonField(parsed, "additions") || wantsJsonField(parsed, "deletions");

  let items: unknown[];
  if (search !== undefined) {
    const query = buildSearchQuery(ctx, "pr", parsed, search);
    items = fetchAllPages(ctx, `/search/issues?q=${encodeURIComponent(query)}`, limit, "items");
  } else {
    const params = new URLSearchParams({ state: flag(parsed, "state") ?? "open" });
    const head = flag(parsed, "head");
    if (head) params.set("head", `${ctx.owner}:${head}`);
    items = fetchAllPages(ctx, `${pullsPath(ctx)}?${params}`, limit);
  }

  const mapped = (items as RawPr[]).map(mapPr);
  if (!wantsStats) return mapped;

  return mapped.map((pr, i) => enrichPrStats(ctx, prNumberOf(items[i]), pr, wantsCommits));
}

export function prView(ctx: RestContext, number: number, parsed: ParsedArgs): unknown {
  const { json } = apiRequest(ctx, "GET", `${pullsPath(ctx)}/${number}`);
  let mapped = mapPr(json as RawPr);

  if (wantsJsonField(parsed, "files")) {
    const files = fetchAllPages(ctx, `${pullsPath(ctx)}/${number}/files`, 100);
    mapped = { ...mapped, files: (files as RawPrFile[]).map(mapPrFile) };
  }
  if (wantsJsonField(parsed, "commits")) {
    const commits = fetchAllPages(ctx, `${pullsPath(ctx)}/${number}/commits`, 100);
    mapped = { ...mapped, commits };
  }

  return mapped;
}

/** Repo's default branch — `gh pr create`'s implicit `--base` default. */
function resolveDefaultBranch(ctx: RestContext): string {
  const { json } = apiRequest(ctx, "GET", `/repos/${ctx.owner}/${ctx.repo}`);
  return (json as { default_branch: string }).default_branch;
}

export interface PrCreateOptions {
  exec?: (cmd: string, args: string[]) => string;
}

export function prCreate(ctx: RestContext, parsed: ParsedArgs, opts: PrCreateOptions = {}): string {
  const labels = flagAll(parsed, "label");
  const head = flag(parsed, "head") ?? currentBranch(opts.exec);
  const base = flag(parsed, "base") ?? resolveDefaultBranch(ctx);

  const { json } = apiRequest(ctx, "POST", pullsPath(ctx), {
    title: flag(parsed, "title") ?? "",
    body: flag(parsed, "body") ?? "",
    head,
    base,
  });
  const created = json as { number: number; html_url: string };

  if (labels.length > 0) {
    apiRequest(ctx, "POST", `/repos/${ctx.owner}/${ctx.repo}/issues/${created.number}/labels`, {
      labels,
    });
  }

  return created.html_url;
}
