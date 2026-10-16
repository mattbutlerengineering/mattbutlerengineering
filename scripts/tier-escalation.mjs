#!/usr/bin/env node
// Escalation policy for .github/workflows/tier-classifier.yml (#6655).
//
// Two decisions live here so they are unit-testable and replayable offline:
//   1. size    - does the diff add enough REVIEW-SURFACE lines to bump a tier?
//   2. keyword - does the title/body carry a real incident signal?
// The workflow keeps only transport (gather inputs, apply verdicts). A throw
// here fails the step, so no tier label lands and merge-queue-eligibility
// fails closed ("awaiting tier classification").

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const T3 = 3;
export const T4 = 4;
export const SIZE_ESCALATION_THRESHOLD = 1000;

// Generated files the classifier already labels T1 "auto-generated", plus
// run-artifact markdown. Source of truth for docs/change-tiers.md (a test
// asserts the doc names every entry).
export const EXCLUDED_FROM_SIZE = [
  "**/llms.txt",
  "**/llms-full.txt",
  "pnpm-lock.yaml",
  "**/registry.json",
  "infrastructure/worker/dep-graph.json",
  "docs/architecture/dependency-graph.md",
  "**/generated*",
  "docs/features/**/*.md",
  "docs/fixes/**/*.md",
];

const EXCLUDED_MATCHERS = [
  /^(?:.*\/)?llms\.txt$/,
  /^(?:.*\/)?llms-full\.txt$/,
  /^pnpm-lock\.yaml$/,
  /^(?:.*\/)?registry\.json$/,
  /^infrastructure\/worker\/dep-graph\.json$/,
  /^docs\/architecture\/dependency-graph\.md$/,
  /(?:^|\/)generated[^/]*(?:\/|$)/,
  /^docs\/features\/.*\.md$/,
  /^docs\/fixes\/.*\.md$/,
];

const isReviewSurface = (path) => !EXCLUDED_MATCHERS.some((re) => re.test(path));

const toCount = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

export function countReviewSurfaceAdditions(files) {
  return (files ?? []).reduce(
    (sum, f) => (isReviewSurface(String(f?.path ?? "")) ? sum + toCount(f?.additions) : sum),
    0
  );
}

export function decideSizeEscalation({ files, highestTier }) {
  const counted = countReviewSurfaceAdditions(files);
  const escalate = counted > SIZE_ESCALATION_THRESHOLD && highestTier < T4;
  return {
    escalate,
    counted,
    reason: `escalate one tier: ${counted} review-surface lines added (generated files excluded)`,
  };
}

// Keyword detection. #5956: mask code spans; `\b` alone treats `-` as a
// boundary, so also refuse a keyword flanked by `-` + word char.
const KEYWORD = /(?<!\w-)\b(?:secrets?|credentials?|rotate|leak(?:s|ed|ing)?|incidents?)\b(?!-\w)/i;
const INCIDENT_CUE =
  /\b(?:leaked|exposed|compromised|breached|revoked)\b|\brotat(?:e|ed|ing) (?:the|our|this|all|its)\b|\bincident (?:report|response|review)\b|\bsecurity incident\b/i;

const maskCode = (text) =>
  String(text ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ");

export const hasKeyword = (text) => KEYWORD.test(maskCode(text));

export function decideKeywordEscalation({ title, bodyProse, pathTier }) {
  const maskedTitle = maskCode(title);
  const maskedBody = maskCode(bodyProse);
  if (!KEYWORD.test(maskedTitle + " " + maskedBody)) {
    return { action: "none", reason: "no keyword" };
  }
  if (pathTier >= T3) {
    return {
      action: "hardset-T4",
      reason:
        "escalate to T4: title/body mentions secrets or incident (sensitive path already matched)",
    };
  }
  const inTitle = KEYWORD.test(maskedTitle);
  const incidentSentence = maskedBody
    .split(/(?<=[.!?])\s+|\n/)
    .some((s) => KEYWORD.test(s) && INCIDENT_CUE.test(s));
  if (inTitle || incidentSentence) {
    return { action: "bump", reason: "escalate one tier: title/body mentions secrets or incident" };
  }
  return { action: "none", reason: "descriptive keyword mention without an incident signal" };
}

// ---- replay (manual, credentialed gate) -----------------------------------

const stripChecklists = (body) =>
  String(body ?? "")
    .split("\n")
    .filter((line) => !/^\s*-\s\[[ xX]\]/.test(line))
    .join("\n");

export function replayRow(pr) {
  const files = pr.files ?? [];
  const total = files.reduce((s, f) => s + toCount(f.additions), 0);
  const counted = countReviewSurfaceAdditions(files);
  const oldSize = total > SIZE_ESCALATION_THRESHOLD;
  const newSize = counted > SIZE_ESCALATION_THRESHOLD;
  const bodyProse = stripChecklists(pr.body);
  const oldKeyword = hasKeyword(`${pr.title ?? ""} ${bodyProse}`);
  // pathTier is not derivable here (the rule table lives in the workflow);
  // 0 compares only the bump path. Hard-sets are unchanged by design.
  const newKeyword =
    decideKeywordEscalation({ title: pr.title, bodyProse, pathTier: 0 }).action !== "none";
  return {
    number: pr.number,
    label: pr.label ?? "",
    size: { old: oldSize, next: newSize, total, counted },
    keyword: { old: oldKeyword, next: newKeyword },
    changed: oldSize !== newSize || oldKeyword !== newKeyword,
  };
}

export function formatReplayTable(rows) {
  const changed = rows.filter((r) => r.changed);
  if (changed.length === 0) return `0 changed of ${rows.length} PRs replayed\n`;
  const yn = (b) => (b ? "escalates" : "-");
  const lines = [
    "| PR | applied label | size old -> new | lines total/counted | keyword old -> new |",
    "| --- | --- | --- | --- | --- |",
    ...changed.map(
      (r) =>
        `| #${r.number} | ${r.label || "-"} | ${yn(r.size.old)} -> ${yn(r.size.next)} | ${r.size.total}/${r.size.counted} | ${yn(r.keyword.old)} -> ${yn(r.keyword.next)} |`
    ),
    "",
    `${changed.length} changed of ${rows.length} PRs replayed`,
  ];
  return lines.join("\n") + "\n";
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

export function fetchRecentPrs(limit, run = gh) {
  const list = JSON.parse(
    run([
      "pr",
      "list",
      "--state",
      "all",
      "--limit",
      String(limit),
      "--json",
      "number,title,body,labels",
    ])
  );
  return list.map((pr) => {
    const files = JSON.parse(run(["pr", "view", String(pr.number), "--json", "files"])).files ?? [];
    const label = (pr.labels ?? []).map((l) => l.name).find((n) => n.startsWith("tier:")) ?? "";
    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      label,
      files: files.map((f) => ({ path: f.path, additions: f.additions })),
    };
  });
}

export function runReplay(
  argv,
  { run = gh, out = (s) => process.stdout.write(s), err = (s) => process.stderr.write(s) } = {}
) {
  const idx = argv.indexOf("--limit");
  const limit = idx >= 0 ? Number(argv[idx + 1]) : 300;
  if (!Number.isInteger(limit) || limit <= 0) {
    err("replay: --limit must be a positive integer\n");
    return 2;
  }
  try {
    const prs = fetchRecentPrs(limit, run);
    out(formatReplayTable(prs.map(replayRow)));
    return 0;
  } catch (e) {
    err(`replay failed (missing gh credential or network?): ${e?.message ?? e}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === "replay") {
    process.exitCode = runReplay(process.argv.slice(3));
  } else {
    process.stderr.write("usage: tier-escalation.mjs replay [--limit N]\n");
    process.exitCode = 2;
  }
}
