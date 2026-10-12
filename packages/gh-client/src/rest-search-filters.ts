import type { ParsedArgs } from "./rest-args.js";
import { flag, flagAll } from "./rest-args.js";
import type { RestContext } from "./rest-http.js";
import { apiRequest } from "./rest-http.js";
import type { RawIssue, RawPr } from "./rest-mappers.js";

/**
 * Claude Code Remote sessions block GitHub's Search API outright
 * (`GET /search/issues` -> 403 "sessions are bound to their configured
 * repositories") while repo-scoped endpoints work with the same token (#6445).
 * Every `--search` shape the sensors use is a conjunction of `label:` /
 * `created:>=` / `closed:>=` / `merged:>=` qualifiers, which the repo-scoped
 * list endpoints can answer with client-side filtering — so we do that and
 * only reach for the Search API for genuinely free-text terms.
 */
export interface SearchFilters {
  /** AND of OR-groups: every group must match at least one of its labels. */
  labelGroups: string[][];
  createdSince?: string;
  closedSince?: string;
  mergedSince?: string;
}

const DATE_QUALIFIER = /^(created|closed|merged):>=(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?)$/;
const LABEL_QUALIFIER = /^label:([^\s",]+(?:,[^\s",]+)*)$/;

/**
 * Parses a `--search` term into structured filters, or `null` when it contains
 * anything that is not a plain label/date qualifier (free text, quotes,
 * `in:title`, ...) and therefore genuinely needs the Search API.
 */
export function parseSearchFilters(search: string, parsed: ParsedArgs): SearchFilters | null {
  const labelGroups: string[][] = flagAll(parsed, "label").map((label) => [label]);
  const dates: Partial<Record<"created" | "closed" | "merged", string>> = {};

  for (const token of search.split(/\s+/).filter(Boolean)) {
    const label = LABEL_QUALIFIER.exec(token);
    if (label?.[1]) {
      labelGroups.push(label[1].split(","));
      continue;
    }
    const date = DATE_QUALIFIER.exec(token);
    if (date?.[1] && date[2]) {
      dates[date[1] as "created" | "closed" | "merged"] = date[2];
      continue;
    }
    return null;
  }

  return {
    labelGroups,
    ...(dates.created ? { createdSince: dates.created } : {}),
    ...(dates.closed ? { closedSince: dates.closed } : {}),
    ...(dates.merged ? { mergedSince: dates.merged } : {}),
  };
}

type Listable = (RawIssue | RawPr) & { updated_at?: string; merged_at?: string | null };

function labelNames(item: Listable): string[] {
  return (item.labels ?? []).map((l) => (typeof l === "string" ? l : l.name));
}

function atOrAfter(value: string | null | undefined, since: string | undefined): boolean {
  if (since === undefined) return true;
  // ISO timestamps compare lexicographically against a date or timestamp prefix.
  return typeof value === "string" && value >= since;
}

function matches(item: Listable, filters: SearchFilters): boolean {
  const names = labelNames(item);
  return (
    filters.labelGroups.every((group) => group.some((l) => names.includes(l))) &&
    atOrAfter(item.created_at, filters.createdSince) &&
    atOrAfter(item.closed_at, filters.closedSince) &&
    atOrAfter(item.merged_at, filters.mergedSince)
  );
}

/** Newest `since` across date filters: a match can never be updated before it. */
function updatedCutoff(filters: SearchFilters): string | undefined {
  const sinces = [filters.createdSince, filters.closedSince, filters.mergedSince].filter(
    (v): v is string => v !== undefined
  );
  return sinces.length > 0 ? sinces.reduce((a, b) => (a > b ? a : b)) : undefined;
}

function paginate(
  ctx: RestContext,
  path: string,
  params: URLSearchParams,
  filters: SearchFilters,
  limit: number,
  skip: (item: Listable) => boolean
): Listable[] {
  const cutoff = updatedCutoff(filters);
  const results: Listable[] = [];
  const perPage = 100;

  for (let page = 1; results.length < limit; page++) {
    const query = new URLSearchParams(params);
    query.set("per_page", String(perPage));
    query.set("page", String(page));
    const { json } = apiRequest(ctx, "GET", `${path}?${query}`);
    const items = Array.isArray(json) ? (json as Listable[]) : [];

    let exhausted = items.length < perPage;
    for (const item of items) {
      // Sorted by `updated` desc: once past the cutoff nothing later can match.
      if (cutoff !== undefined && (item.updated_at ?? "") < cutoff) {
        exhausted = true;
        break;
      }
      if (!skip(item) && matches(item, filters)) results.push(item);
    }
    if (exhausted) break;
  }
  return results.slice(0, limit);
}

/** One request-set per member of the first OR-group (labels= is AND-only). */
function labelParamSets(filters: SearchFilters): (string | undefined)[] {
  const singles = filters.labelGroups.filter((g) => g.length === 1).map((g) => g[0]);
  const orGroup = filters.labelGroups.find((g) => g.length > 1);
  if (!orGroup) return [singles.length > 0 ? singles.join(",") : undefined];
  return orGroup.map((member) => [...singles, member].join(","));
}

function listFiltered(
  ctx: RestContext,
  path: string,
  state: string,
  filters: SearchFilters,
  limit: number,
  skip: (item: Listable) => boolean,
  serverSideLabels = true
): Listable[] {
  const seen = new Set<number>();
  const merged: Listable[] = [];
  for (const labels of serverSideLabels ? labelParamSets(filters) : [undefined]) {
    const params = new URLSearchParams({ state, sort: "updated", direction: "desc" });
    if (labels) params.set("labels", labels);
    for (const item of paginate(ctx, path, params, filters, limit, skip)) {
      if (!seen.has(item.number)) {
        seen.add(item.number);
        merged.push(item);
      }
    }
  }
  // Newest first across members, so one large member cannot crowd out the rest.
  const byUpdatedDesc = [...merged].sort((a, b) =>
    (b.updated_at ?? "").localeCompare(a.updated_at ?? "")
  );
  return byUpdatedDesc.slice(0, limit);
}

export function listIssuesByFilters(
  ctx: RestContext,
  parsed: ParsedArgs,
  filters: SearchFilters,
  limit: number
): RawIssue[] {
  const state = flag(parsed, "state") ?? "all";
  const path = `/repos/${ctx.owner}/${ctx.repo}/issues`;
  return listFiltered(ctx, path, state, filters, limit, (i) => "pull_request" in i) as RawIssue[];
}

export function listPrsByFilters(
  ctx: RestContext,
  parsed: ParsedArgs,
  filters: SearchFilters,
  limit: number
): RawPr[] {
  const requested = flag(parsed, "state") ?? "all";
  // `merged:` implies closed, and the pulls endpoint has no "merged" state.
  const state = filters.mergedSince !== undefined || requested === "merged" ? "closed" : requested;
  const path = `/repos/${ctx.owner}/${ctx.repo}/pulls`;
  // /pulls has no `labels` param: one unlabelled request set, labels filtered client-side.
  return listFiltered(ctx, path, state, filters, limit, () => false, false) as RawPr[];
}
