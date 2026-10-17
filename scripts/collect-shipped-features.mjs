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
