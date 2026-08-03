/**
 * Maps GitHub REST API response shapes onto the camelCase field names `gh`
 * itself prints for `--json <fields>`, so callers reading e.g. `pr.headRefName`
 * or `issue.closedAt` see the same shape regardless of transport. Each `Raw*`
 * interface only declares the fields this module actually reads.
 */

export interface RawLabel {
  name: string;
  color?: string;
  description?: string | null;
}

export interface RawUser {
  login: string;
}

export interface RawIssue {
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  state_reason?: string | null;
  labels?: (RawLabel | string)[];
  created_at?: string;
  closed_at?: string | null;
  user?: RawUser | null;
}

export interface RawPr {
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  head?: { ref?: string };
  labels?: (RawLabel | string)[];
  created_at?: string;
  merged_at?: string | null;
  closed_at?: string | null;
  user?: RawUser | null;
  additions?: number;
  deletions?: number;
  merge_commit_sha?: string | null;
}

export interface RawPrFile {
  filename: string;
  additions: number;
  deletions: number;
}

export interface RawWorkflowRun {
  status?: string;
  conclusion?: string | null;
  created_at?: string;
  name?: string;
  head_branch?: string;
  head_sha?: string;
}

function mapLabelEntry(label: RawLabel | string): {
  name: string;
  color?: string;
  description?: string | null;
} {
  if (typeof label === "string") return { name: label };
  return { name: label.name, color: label.color, description: label.description ?? null };
}

export function mapIssue(raw: RawIssue): Record<string, unknown> {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    state: String(raw.state ?? "").toUpperCase(),
    stateReason: raw.state_reason ?? null,
    labels: (raw.labels ?? []).map(mapLabelEntry),
    createdAt: raw.created_at,
    closedAt: raw.closed_at,
    author: raw.user ? { login: raw.user.login } : undefined,
  };
}

/** `raw.merged_at` disambiguates gh's 3-way OPEN/CLOSED/MERGED PR state. */
function mapPrState(raw: RawPr): string {
  if (raw.merged_at) return "MERGED";
  return String(raw.state ?? "").toUpperCase();
}

export function mapPr(raw: RawPr): Record<string, unknown> {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? "",
    state: mapPrState(raw),
    headRefName: raw.head?.ref,
    labels: (raw.labels ?? []).map(mapLabelEntry),
    createdAt: raw.created_at,
    mergedAt: raw.merged_at ?? null,
    closedAt: raw.closed_at ?? null,
    author: raw.user ? { login: raw.user.login } : undefined,
    additions: raw.additions,
    deletions: raw.deletions,
    mergeCommit: raw.merge_commit_sha ? { oid: raw.merge_commit_sha } : undefined,
  };
}

/** `gh pr view --json files` names the field `path`; REST calls it `filename`. */
export function mapPrFile(raw: RawPrFile): Record<string, unknown> {
  return { path: raw.filename, additions: raw.additions, deletions: raw.deletions };
}

export function mapLabel(raw: RawLabel): Record<string, unknown> {
  return { name: raw.name, color: raw.color, description: raw.description ?? null };
}

export function mapWorkflowRun(raw: RawWorkflowRun): Record<string, unknown> {
  return {
    status: raw.status,
    conclusion: raw.conclusion,
    createdAt: raw.created_at,
    name: raw.name,
    headBranch: raw.head_branch,
    headSha: raw.head_sha,
  };
}
