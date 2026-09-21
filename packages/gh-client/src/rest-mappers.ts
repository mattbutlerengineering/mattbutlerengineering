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

/** A `commit.author` / `commit.committer` block — git identity, no GitHub login. */
export interface RawGitIdentity {
  name?: string;
  email?: string;
  date?: string;
}

/** One entry of `GET /repos/{o}/{r}/pulls/{n}/commits`. */
export interface RawPrCommit {
  sha: string;
  commit: {
    author?: RawGitIdentity | null;
    committer?: RawGitIdentity | null;
    message?: string;
  };
  /** The resolved GitHub account, or null when the commit email maps to none. */
  author?: RawUser | null;
}

/** One entry of `GET /repos/{o}/{r}/pulls/{n}/reviews`. */
export interface RawPrReview {
  id?: number;
  node_id?: string;
  user?: RawUser | null;
  body?: string | null;
  state?: string;
  submitted_at?: string;
  author_association?: string;
}

export interface RawWorkflowRun {
  id?: number;
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

/**
 * Splits a raw commit message into GraphQL's `messageHeadline`/`messageBody`
 * pair: everything up to the first blank line is the headline (internal
 * newlines folded to spaces, so the field stays single-line the way callers
 * assume), everything after it is the body.
 *
 * One deliberate, measured divergence from GitHub's GraphQL: GitHub truncates
 * `messageHeadline` at 69 characters and prefixes `messageBody` with an
 * ellipsis plus the rest of the subject. Verified against PR #3250, whose
 * 73-character subject comes back as `"…Booking Wi…"` + `"…dget\n\n…"`.
 * That is a lossy presentation quirk, and reproducing its exact rule from one
 * observed sample would be guesswork — headline + body reconstruct the whole
 * message either way, so the subject is kept intact here. See #4706.
 */
export function splitCommitMessage(message: string | undefined): {
  messageHeadline: string;
  messageBody: string;
} {
  const lines = (message ?? "").split("\n");
  const blank = lines.findIndex((line) => line.trim() === "");
  if (blank === -1) return { messageHeadline: lines.join(" ").trim(), messageBody: "" };

  return {
    messageHeadline: lines.slice(0, blank).join(" ").trim(),
    messageBody: lines
      .slice(blank + 1)
      .join("\n")
      .trim(),
  };
}

/**
 * The commit's author as a GraphQL-shaped `authors` entry. REST carries the
 * git identity (`commit.author.name`/`.email`) separately from the resolved
 * GitHub account (`author.login`), and the latter is null whenever the commit
 * email maps to no account. `login` is then **omitted**, never synthesized
 * from the name or email: a plausible-looking fabricated login is exactly the
 * silent-wrong-data failure #4706 exists to close.
 */
function mapCommitAuthors(raw: RawPrCommit): Record<string, unknown>[] {
  const entry = {
    ...(raw.author?.login != null ? { login: raw.author.login } : {}),
    ...(raw.commit?.author?.name != null ? { name: raw.commit.author.name } : {}),
    ...(raw.commit?.author?.email != null ? { email: raw.commit.author.email } : {}),
  };
  return Object.keys(entry).length === 0 ? [] : [entry];
}

/**
 * Maps a raw REST PR commit onto the field names `gh pr view --json commits`
 * prints, so consumers reading `authors[].login` / `messageHeadline` /
 * `authoredDate` behave the same on either transport (#4706).
 */
export function mapPrCommit(raw: RawPrCommit): Record<string, unknown> {
  const { messageHeadline, messageBody } = splitCommitMessage(raw.commit?.message);
  return {
    oid: raw.sha,
    messageHeadline,
    messageBody,
    authoredDate: raw.commit?.author?.date,
    committedDate: raw.commit?.committer?.date,
    authors: mapCommitAuthors(raw),
  };
}

/**
 * Maps a raw REST review onto `gh pr view --json reviews`'s names. GraphQL's
 * `includesCreatedEdit`/`reactionGroups` have no REST equivalent and are
 * omitted rather than guessed at.
 */
export function mapPrReview(raw: RawPrReview): Record<string, unknown> {
  return {
    id: raw.node_id ?? raw.id,
    author: raw.user ? { login: raw.user.login } : undefined,
    authorAssociation: raw.author_association,
    body: raw.body ?? "",
    state: raw.state,
    submittedAt: raw.submitted_at,
  };
}

export function mapLabel(raw: RawLabel): Record<string, unknown> {
  return { name: raw.name, color: raw.color, description: raw.description ?? null };
}

export function mapWorkflowRun(raw: RawWorkflowRun): Record<string, unknown> {
  return {
    databaseId: raw.id,
    status: raw.status,
    conclusion: raw.conclusion,
    createdAt: raw.created_at,
    name: raw.name,
    headBranch: raw.head_branch,
    headSha: raw.head_sha,
  };
}
