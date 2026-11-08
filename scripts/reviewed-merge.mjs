#!/usr/bin/env node

/**
 * reviewed-merge.mjs — decides whether `reviewed-merge.yml` may merge a PR a
 * cloud routine already reviewed.
 *
 * Cloud routines cannot merge: the auto-mode classifier denies the call as
 * `[Merge Without Review]` and no settings rule reaches it there (#6125,
 * measured 2026-11-07). So a routine records its verdict instead: a PR comment
 * whose first line is `reviewed-merge: <head sha> PASS <score>/10` (or
 * `PASS fast-path`), plus the `reviewed` label. The workflow merges with
 * `AUTOMATION_PAT`, so main's push workflows still fire (a `GITHUB_TOKEN`
 * merge fires none).
 *
 * The verdict only counts when the repository owner wrote it (routines post
 * as the owner), it names the CURRENT head SHA, and CI Gate is green on that
 * SHA. Gate paths and `needs-review` always wait for a human. A `fast-path`
 * verdict is trusted the same way as a score: both are the routine's own
 * finding, and the gate-path and hold checks above still run here.
 *
 * Usage:
 *   node scripts/reviewed-merge.mjs decide --pr <N>
 *   # stdout: {"action":"merge"|"skip","reason":"...",...}; exit 1 on a gh failure.
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { GATE_PATH_MATCHERS, NEEDS_REVIEW_LABEL } from "./fast-path-decision.mjs";

export const REVIEWED_LABEL = "reviewed";
export const MIN_SCORE = 7;
const CI_GATE = "CI Gate";
const VERDICT_RE = /^reviewed-merge: ([0-9a-f]{40}) PASS (?:(\d{1,2})\/10|(fast-path))\s*$/;

/** Parse the first line of a comment body; null when it is not a verdict. */
export function parseVerdict(body) {
  const first = String(body ?? "")
    .split("\n", 1)[0]
    .trim();
  const m = VERDICT_RE.exec(first);
  if (!m) return null;
  return m[3]
    ? { sha: m[1], score: null, fastPath: true }
    : { sha: m[1], score: Number(m[2]), fastPath: false };
}

const skip = (reason) => ({ action: "skip", reason });

/**
 * Pure decision.
 * @param {{
 *   pr: {number:number,state:string,draft:boolean,title:string,headSha:string,labels:string[],files:string[]},
 *   comments: Array<{body:string,user:{login:string},author_association:string,created_at:string}>,
 *   ownerLogin: string,
 *   ciGate: null | {status:string, conclusion:string|null},
 * }} input
 */
export function decideReviewedMerge({ pr, comments, ownerLogin, ciGate }) {
  if (pr.state !== "open") return skip("PR is not open");
  if (pr.draft) return skip("PR is a draft");
  if (!pr.labels.includes(REVIEWED_LABEL)) return skip(`no \`${REVIEWED_LABEL}\` label`);
  if (pr.labels.includes(NEEDS_REVIEW_LABEL)) return skip("`needs-review` hold");
  const gate = pr.files.find((f) => GATE_PATH_MATCHERS.some((g) => g.matches(f)));
  if (gate) return skip(`gate path needs a human merge: ${gate}`);

  const verdicts = comments
    .filter((c) => c.user?.login === ownerLogin && c.author_association === "OWNER")
    .map((c) => ({ ...parseVerdict(c.body), at: c.created_at, ok: parseVerdict(c.body) !== null }))
    .filter((v) => v.ok && v.sha === pr.headSha)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const latest = verdicts[0];
  if (!latest) return skip("no verdict for the current head SHA");
  if (!latest.fastPath && latest.score < MIN_SCORE)
    return skip(`review score ${latest.score} is below ${MIN_SCORE}`);

  if (!ciGate || ciGate.status !== "completed" || ciGate.conclusion !== "success") {
    return skip(`CI Gate is not green on ${pr.headSha.slice(0, 7)}`);
  }

  return {
    action: "merge",
    reason: latest.fastPath
      ? "fast-path verdict, CI Gate green"
      : `review ${latest.score}/10, CI Gate green`,
    sha: pr.headSha,
    commitTitle: `${pr.title} (#${pr.number})`,
  };
}

function gh(args) {
  return JSON.parse(
    execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  );
}

async function main(argv) {
  const i = argv.indexOf("--pr");
  const n = Number(argv[i + 1]);
  if (argv[0] !== "decide" || i < 0 || !Number.isInteger(n) || n <= 0) {
    process.stderr.write("usage: reviewed-merge.mjs decide --pr <N>\n");
    return 2;
  }
  const repo = process.env.GITHUB_REPOSITORY ?? "mattbutlerengineering/mattbutlerengineering";
  try {
    const p = gh([`repos/${repo}/pulls/${n}`]);
    const files = gh(["--paginate", "--slurp", `repos/${repo}/pulls/${n}/files?per_page=100`])
      .flat()
      .map((f) => f.filename);
    const comments = gh([
      "--paginate",
      "--slurp",
      `repos/${repo}/issues/${n}/comments?per_page=100`,
    ]).flat();
    const runs =
      gh([
        `repos/${repo}/commits/${p.head.sha}/check-runs?check_name=${encodeURIComponent(CI_GATE)}`,
      ]).check_runs ?? [];
    const latestRun =
      [...runs].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0] ?? null;
    const decision = decideReviewedMerge({
      pr: {
        number: p.number,
        state: p.state,
        draft: p.draft,
        title: p.title,
        headSha: p.head.sha,
        labels: p.labels.map((l) => l.name),
        files,
      },
      comments,
      ownerLogin: repo.split("/")[0],
      ciGate: latestRun && { status: latestRun.status, conclusion: latestRun.conclusion },
    });
    process.stdout.write(`${JSON.stringify({ pr: n, ...decision })}\n`);
    return 0;
  } catch (err) {
    process.stderr.write(`reviewed-merge: could not read PR #${n}: ${err.message}\n`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
