/**
 * collect-shipped-features.mjs — pure core of the "shipped by the factory"
 * snapshot generator (#6900, feature shipped-stories).
 *
 * Walks proposal -> closed `tracking` issue -> child issues -> merged PRs and
 * derives the snapshot shape defined by `apps/marketing/src/data/shipped-features.ts`.
 * No network and no filesystem here; the `gh` I/O wrapper is a separate issue.
 * Every input is an untrusted REST payload, so malformed entries are ignored
 * rather than thrown on. Node builtins and sibling modules only
 * (scripts/check-workflow-deps.mjs).
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractClosedIssue } from "./collect-queue-telemetry-from-github.mjs";

const TASK_LINE_RE = /^\s*[-*]\s+\[[ xX]\]\s+#(\d+)\b/;
const PROPOSAL_RE = /\bproposal(?:\s+issue)?\s+#(\d+)/i;

/** Demo surfaces, in tie-break order. */
const SURFACES = [
  { url: "/hospitality/", matches: (p) => p.startsWith("apps/hospitality/") },
  {
    url: "/rialto/",
    matches: (p) => p.startsWith("apps/rialto-web/") || p.startsWith("packages/rialto/"),
  },
  { url: "/", matches: (p) => p.startsWith("apps/marketing/") },
];

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isIssueNumber = (v) => Number.isInteger(v) && v > 0;
const toIso = (v) => {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
};

/** Child issue numbers from `- [ ] #N — title` lines, in order, de-duplicated. @param {unknown} body */
export function parseTaskList(body) {
  if (typeof body !== "string") return [];
  const seen = new Set();
  for (const line of body.split(/\r?\n/)) {
    const m = TASK_LINE_RE.exec(line);
    if (m) seen.add(Number(m[1]));
  }
  return [...seen];
}

/** Originating proposal issue number named in a tracking body, else null. @param {unknown} body */
export function extractProposalIssue(body) {
  if (typeof body !== "string") return null;
  const m = PROPOSAL_RE.exec(body);
  return m ? Number(m[1]) : null;
}

function cleanTitle(title) {
  return String(title ?? "")
    .replace(/^\s*\[Feature\]\s*/i, "")
    .replace(/:\s*tracking issue\s*$/i, "")
    .trim();
}

/** Deterministic kebab-case slug, suffixed with the issue number. @param {{number: number, title?: string}} issue */
export function slugFor(issue) {
  const base = cleanTitle(issue.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base ? `${base}-${issue.number}` : String(issue.number);
}

/** Site-relative demo surface with the most changed files; null when none match. @param {unknown} changedPaths */
export function liveUrlFor(changedPaths) {
  if (!Array.isArray(changedPaths)) return null;
  let best = null;
  let bestCount = 0;
  for (const surface of SURFACES) {
    const count = changedPaths.filter((p) => typeof p === "string" && surface.matches(p)).length;
    if (count > bestCount) {
      best = surface.url;
      bestCount = count;
    }
  }
  return best;
}

function derivePr(raw) {
  if (!isObj(raw) || !isIssueNumber(raw.number) || typeof raw.title !== "string") return null;
  const mergedAt = toIso(raw.merged_at);
  if (!mergedAt || typeof raw.merge_commit_sha !== "string") return null;
  return {
    number: raw.number,
    title: raw.title,
    mergedAt,
    mergeCommit: raw.merge_commit_sha,
    reviewVerdict:
      raw.reviewVerdict === "pass" || raw.reviewVerdict === "flag" ? raw.reviewVerdict : null,
    ciGate: raw.ciGate === "success" || raw.ciGate === "failure" ? raw.ciGate : null,
    files: Array.isArray(raw.files) ? raw.files.filter((f) => typeof f === "string") : [],
  };
}

function firstParagraph(body) {
  if (typeof body !== "string") return null;
  const para = body
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#"));
  return para ?? null;
}

function deriveFeature(tracking, childIssuesByNumber, prsByIssue, proposalsByNumber) {
  const childNumbers = parseTaskList(tracking.body);
  if (childNumbers.length === 0) return { skip: "noTaskList" };

  const children = [];
  const allFiles = [];
  for (const issue of childNumbers) {
    const child = childIssuesByNumber[issue];
    const rawPrs = prsByIssue[issue];
    const prs = (Array.isArray(rawPrs) ? rawPrs : [])
      .map(derivePr)
      .filter(Boolean)
      .sort((a, b) => Date.parse(a.mergedAt) - Date.parse(b.mergedAt) || a.number - b.number);
    if (prs.length === 0) continue;
    for (const p of prs) allFiles.push(...p.files);
    children.push({
      issue,
      title: isObj(child) && typeof child.title === "string" ? child.title : `#${issue}`,
      prs: prs.map(({ files: _files, ...pr }) => pr),
    });
  }
  if (children.length === 0) return { skip: "noMergedPrs" };

  const merged = children.flatMap((c) => c.prs.map((p) => Date.parse(p.mergedAt)));
  const firstMs = Math.min(...merged);
  const lastMs = Math.max(...merged);

  const proposalIssue = extractProposalIssue(tracking.body);
  const proposal = proposalIssue === null ? undefined : proposalsByNumber[proposalIssue];
  const proposedAt = isObj(proposal) ? toIso(proposal.created_at) : null;
  const startMs = Date.parse(
    proposedAt ?? toIso(tracking.created_at) ?? new Date(firstMs).toISOString()
  );

  return {
    feature: {
      slug: slugFor(tracking),
      title: cleanTitle(tracking.title),
      trackingIssue: tracking.number,
      proposalIssue,
      proposalEvidence: isObj(proposal) ? firstParagraph(proposal.body) : null,
      proposedAt,
      firstMergedAt: new Date(firstMs).toISOString(),
      lastMergedAt: new Date(lastMs).toISOString(),
      wallClockHours: Math.round(((lastMs - startMs) / 3_600_000) * 10) / 10,
      liveUrl: liveUrlFor(allFiles),
      children,
    },
  };
}

/**
 * Derive the snapshot. Pure and deterministic: the same input (in any array
 * order) yields byte-identical JSON.
 *
 * @param {object} input
 * @param {Array<object>} input.trackingIssues - Closed `tracking` issues (REST).
 * @param {Record<number, object>} input.childIssuesByNumber
 * @param {Record<number, Array<object>>} input.prsByIssue - Merged-PR records per child issue,
 *   each `{ number, title, merged_at, merge_commit_sha, files?, reviewVerdict?, ciGate? }`.
 * @param {Record<number, object>} input.proposalsByNumber
 * @param {string} input.generatedAt
 * @returns {{ snapshot: {generatedAt: string, features: object[]}, skipped: {noTaskList: number, noMergedPrs: number} }}
 */
export function deriveShippedFeatures(input) {
  const src = isObj(input) ? input : {};
  const trackingIssues = Array.isArray(src.trackingIssues) ? src.trackingIssues : [];
  const childIssuesByNumber = isObj(src.childIssuesByNumber) ? src.childIssuesByNumber : {};
  const prsByIssue = isObj(src.prsByIssue) ? src.prsByIssue : {};
  const proposalsByNumber = isObj(src.proposalsByNumber) ? src.proposalsByNumber : {};

  const skipped = { noTaskList: 0, noMergedPrs: 0 };
  const features = [];
  for (const tracking of trackingIssues) {
    if (!isObj(tracking) || !isIssueNumber(tracking.number)) continue;
    const result = deriveFeature(tracking, childIssuesByNumber, prsByIssue, proposalsByNumber);
    if (result.skip) skipped[result.skip] += 1;
    else features.push(result.feature);
  }
  features.sort(
    (a, b) =>
      Date.parse(b.lastMergedAt) - Date.parse(a.lastMergedAt) || b.trackingIssue - a.trackingIssue
  );

  return {
    snapshot: { generatedAt: toIso(src.generatedAt) ?? new Date(0).toISOString(), features },
    skipped,
  };
}

// ---------------------------------------------------------------------------
// I/O layer (#6901). REST only via `gh api` — the GraphQL-backed `gh issue` /
// `gh pr` subcommands are blocked in Claude Code sessions (gotchas.md).
// The `gh` runner is injected: (args: string[]) => string (throws on failure).
// ---------------------------------------------------------------------------

const DEFAULT_OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../apps/marketing/src/data/shipped-features.json"
);
const VERDICT_RE = /\bverdict\b[^A-Za-z\n]{0,6}(pass|flag)\b/i;

/** Real runner: execFileSync("gh", args). Throws with gh's stderr on failure. */
export function defaultGh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

/** GET one REST path as parsed JSON. */
function ghJson(gh, path) {
  return JSON.parse(gh(["api", path]));
}

/** GET a paginated REST list, flattened across pages (`--paginate --slurp`). */
function ghList(gh, path) {
  const pages = JSON.parse(gh(["api", "--paginate", "--slurp", path]));
  return Array.isArray(pages) ? pages.flat() : [];
}

function ciGateFor(gh, sha) {
  const runs = ghJson(gh, `repos/{owner}/{repo}/commits/${sha}/check-runs?check_name=CI%20Gate`);
  const run = Array.isArray(runs?.check_runs) ? runs.check_runs[0] : undefined;
  let outcome = run?.conclusion ?? null;
  if (!outcome) {
    const statuses = ghList(gh, `repos/{owner}/{repo}/commits/${sha}/statuses`);
    outcome = statuses.find((s) => s?.context === "CI Gate")?.state ?? null;
  }
  if (outcome === "success") return "success";
  return outcome === "failure" || outcome === "error" ? "failure" : null;
}

function verdictFor(gh, prNumber) {
  const comments = ghList(gh, `repos/{owner}/{repo}/issues/${prNumber}/comments`);
  for (const c of [...comments].reverse()) {
    const m = VERDICT_RE.exec(typeof c?.body === "string" ? c.body : "");
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function mergedPrRecord(gh, prNumber) {
  const pr = ghJson(gh, `repos/{owner}/{repo}/pulls/${prNumber}`);
  if (!pr?.merged_at) return null;
  const files = ghList(gh, `repos/{owner}/{repo}/pulls/${prNumber}/files`).map((f) => f?.filename);
  return {
    number: pr.number,
    title: pr.title,
    merged_at: pr.merged_at,
    merge_commit_sha: pr.merge_commit_sha,
    files,
    ciGate: typeof pr.head?.sha === "string" ? ciGateFor(gh, pr.head.sha) : null,
    reviewVerdict: verdictFor(gh, prNumber),
  };
}

/** Merged PRs that name `issue` with a closing keyword, found via the issue timeline. */
function mergedPrsClosing(gh, issue) {
  const events = ghList(gh, `repos/{owner}/{repo}/issues/${issue}/timeline`);
  const numbers = new Set();
  for (const e of events) {
    const src = e?.event === "cross-referenced" ? e.source?.issue : null;
    if (src?.pull_request && extractClosedIssue(src.body) === issue) numbers.add(src.number);
  }
  return [...numbers]
    .sort((a, b) => a - b)
    .map((n) => mergedPrRecord(gh, n))
    .filter(Boolean);
}

/** Gather everything `deriveShippedFeatures` needs. @param {(args: string[]) => string} gh */
export function gatherShippedFeatureInput(gh, { limit } = {}) {
  let trackingIssues = ghList(
    gh,
    "repos/{owner}/{repo}/issues?labels=tracking&state=closed&per_page=100"
  )
    .filter((i) => i && !i.pull_request)
    .sort((a, b) => b.number - a.number);
  if (limit !== undefined) trackingIssues = trackingIssues.slice(0, limit);

  const childIssuesByNumber = {};
  const prsByIssue = {};
  const proposalsByNumber = {};
  for (const tracking of trackingIssues) {
    for (const n of parseTaskList(tracking.body)) {
      if (childIssuesByNumber[n]) continue;
      childIssuesByNumber[n] = ghJson(gh, `repos/{owner}/{repo}/issues/${n}`);
      prsByIssue[n] = mergedPrsClosing(gh, n);
    }
    const p = extractProposalIssue(tracking.body);
    if (p !== null && !proposalsByNumber[p]) {
      proposalsByNumber[p] = ghJson(gh, `repos/{owner}/{repo}/issues/${p}`);
    }
  }
  return { trackingIssues, childIssuesByNumber, prsByIssue, proposalsByNumber };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, limit: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--out" && argv[i + 1]) opts.out = resolve(argv[++i]);
    else if (arg === "--limit" && /^[1-9]\d*$/.test(argv[i + 1] ?? ""))
      opts.limit = Number(argv[++i]);
    else throw new Error(`unknown or invalid argument: ${arg}`);
  }
  return opts;
}

/**
 * Run the CLI. Returns the exit code; never writes unless the whole gather and
 * derive succeeded, so a failed fetch cannot clobber a good snapshot.
 * generatedAt is the newest merge time (not "now") so reruns are byte-identical.
 */
export function runCli(
  argv,
  { gh = defaultGh, write = writeFileSync, log = console.log, err = console.error } = {}
) {
  try {
    const opts = parseArgs(argv);
    const input = gatherShippedFeatureInput(gh, { limit: opts.limit });
    const derived = deriveShippedFeatures({ ...input, generatedAt: new Date(0).toISOString() });
    const newest = derived.snapshot.features
      .map((f) => f.lastMergedAt)
      .sort()
      .at(-1);
    const snapshot = { ...derived.snapshot, generatedAt: newest ?? derived.snapshot.generatedAt };
    // A self-check that passes on no data is worse than none: an empty result
    // means the collector lost its inputs (#7348), not that nothing shipped.
    if (snapshot.features.length === 0) {
      throw new Error(
        "zero features collected; refusing to overwrite the snapshot with an empty one"
      );
    }
    const { skipped } = derived;
    const json = `${JSON.stringify(snapshot, null, 2)}\n`;
    if (opts.dryRun) log(json.trimEnd());
    else write(opts.out, json);
    log(
      `wrote ${snapshot.features.length} features, skipped ${skipped.noTaskList + skipped.noMergedPrs}${
        opts.dryRun ? " (dry run)" : ""
      }`
    );
    return 0;
  } catch (e) {
    err(
      `collect-shipped-features: failed, snapshot left untouched: ${e instanceof Error ? e.message : e}`
    );
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runCli(process.argv.slice(2));
}
