#!/usr/bin/env node

/**
 * fast-path-decision.mjs — the single executable entry point for "may this PR
 * merge without review, and which specialist reviewers does it need?".
 *
 * That decision used to live only as a five-step ordering in prose
 * (`.claude/implement-queue.md` § fast-path / § reviewers, restated in
 * `.claude/skills/ship-pr/SKILL.md`): freshness check → `needs-review` label →
 * gate paths → `qualifiesForLowRiskFastPath` → `reviewersForDiff`. No code
 * called the last two; every run hand-wrote a
 * `node --input-type=module -e "import … dist/index.js"` (#3989, #4063, ship-pr
 * review "Minor 2"). `decideFastPath` is the ordering as a pure function;
 * the CLI fetches the inputs once and prints the decision as JSON.
 *
 * Fails closed. A classifier that cannot be trusted (stale/missing dist, or the
 * dist would not import) is never read as "low risk" or "no specialists match":
 * the decision is no fast path and EVERY specialist reviewer. A gh failure is
 * not a decision at all — exit 1, nothing on stdout — so a caller can never
 * mistake a network error for a verdict.
 *
 * Usage:
 *   node scripts/fast-path-decision.mjs check --pr <N>
 *   node scripts/fast-path-decision.mjs check --files a,b,c     # no gh
 *   # stdout: {"fastPath":bool,"reviewers":[...],"holdForHuman":bool,"reason":"..."}
 *   # exit 0 on ANY decision (including fail-closed), 2 usage error,
 *   # 1 when the PR's files/labels could not be fetched.
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import { ensureFreshAgentCoreBuild } from "./agent-core-build-freshness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST_ENTRY = path.join(ROOT, "packages/agent-core/dist/index.js");

/** Label that always holds a PR out of the fast path. */
export const NEEDS_REVIEW_LABEL = "needs-review";

/**
 * Every specialist `reviewersForDiff` can return — the fail-closed fallback
 * when the classifier is unusable, so it cannot be derived from the dist.
 * Kept equal to `DIFF_REVIEWERS` in `packages/agent-core/src/pr-risk-classifier.ts`
 * (same names, same order) by `scripts/__tests__/fast-path-decision.test.mjs`,
 * which parses that source file; adding a reviewer there fails the test until
 * this list follows.
 */
export const ALL_SPECIALIST_REVIEWERS = Object.freeze([
  "migration-reviewer",
  "adr-compliance-reviewer",
  "rialto-prop-drift-detector",
  "e2e-selector-drift-reviewer",
  "dependency-update-reviewer",
  "stripe-flow-reviewer",
  "generated-artifact-determinism-reviewer",
]);

/**
 * Pure decision, in strict precedence order.
 *
 * @param {{
 *   files: readonly string[],
 *   labels: readonly string[],
 *   freshness: {trusted: boolean, state?: string, reason?: string},
 *   classifier: null | {
 *     qualifiesForLowRiskFastPath: (files: readonly string[]) => boolean,
 *     reviewersForDiff: (files: readonly string[]) => string[],
 *     matchesGatePath: (file: string) => boolean,
 *   },
 * }} input
 * @returns {{fastPath: boolean, reviewers: string[], holdForHuman: boolean, reason: string}}
 */
export function decideFastPath({ files, labels, freshness, classifier }) {
  const failClosed = (reason) => ({
    fastPath: false,
    reviewers: [...ALL_SPECIALIST_REVIEWERS],
    // Gate paths are only knowable through the classifier; with none loaded,
    // the merge-command hook's own gate-path check still applies.
    holdForHuman: classifier ? files.some(classifier.matchesGatePath) : false,
    reason,
  });

  if (classifier === null) {
    return failClosed(
      `agent-core dist could not be loaded (freshness: ${freshness?.state ?? "unknown"}) — failing closed: no fast path, every specialist reviewer`
    );
  }
  if (!freshness?.trusted) {
    return failClosed(
      `agent-core dist freshness is ${freshness?.state ?? "unknown"}, not trusted — failing closed: no fast path, every specialist reviewer`
    );
  }

  const reviewers = classifier.reviewersForDiff(files);

  if (files.length === 0) {
    return {
      fastPath: false,
      reviewers,
      holdForHuman: false,
      reason: "no changed files — failing closed: no fast path",
    };
  }
  if (files.some(classifier.matchesGatePath)) {
    return {
      fastPath: false,
      reviewers,
      holdForHuman: true,
      reason: "a changed file matches a gate path — hold for a human merge (ADR-0087)",
    };
  }
  if (labels.includes(NEEDS_REVIEW_LABEL)) {
    return {
      fastPath: false,
      reviewers,
      holdForHuman: false,
      reason: `PR carries the ${NEEDS_REVIEW_LABEL} label — fast path off-limits`,
    };
  }

  if (classifier.qualifiesForLowRiskFastPath(files)) {
    return {
      fastPath: true,
      reviewers,
      holdForHuman: false,
      reason: "low-risk diff, no specialist matched",
    };
  }
  return {
    fastPath: false,
    reviewers,
    holdForHuman: false,
    reason:
      reviewers.length > 0
        ? `specialist reviewer(s) matched: ${reviewers.join(", ")}`
        : "diff is not low-risk — full review, no specialist matched",
  };
}

const USAGE = "Usage: fast-path-decision.mjs check (--pr <N> | --files a,b,c)";

/**
 * @param {string[]} argv arguments after the script name
 * @returns {{pr: string} | {files: string[]} | {usage: string}}
 */
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command !== "check") return { usage: USAGE };

  let pr;
  let files;
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (flag === "--pr" && value !== undefined && /^\d+$/.test(value) && pr === undefined) {
      pr = value;
    } else if (flag === "--files" && value !== undefined && files === undefined) {
      files = value
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
    } else {
      return { usage: USAGE };
    }
    i += 1;
  }

  if ((pr === undefined) === (files === undefined)) return { usage: USAGE };
  if (files !== undefined) return files.length > 0 ? { files } : { usage: USAGE };
  return { pr };
}

/**
 * @param {string[]} argv
 * @param {{
 *   getFiles: (pr: string) => string[],
 *   getLabels: (pr: string) => string[],
 *   getFreshness: () => {trusted: boolean},
 *   loadClassifier: () => Promise<object|null>,
 *   out: (line: string) => void,
 *   err: (line: string) => void,
 * }} deps
 * @returns {Promise<number>} process exit code
 */
export async function main(argv, deps) {
  const parsed = parseArgs(argv);
  if ("usage" in parsed) {
    deps.err(`${parsed.usage}\n`);
    return 2;
  }

  let files;
  let labels;
  try {
    if ("pr" in parsed) {
      files = deps.getFiles(parsed.pr);
      labels = deps.getLabels(parsed.pr);
    } else {
      files = parsed.files;
      labels = [];
    }
  } catch (error) {
    deps.err(
      `fast-path-decision: could not fetch PR data: ${error instanceof Error ? error.message : String(error)}\n`
    );
    return 1;
  }

  const freshness = deps.getFreshness();
  const classifier = await deps.loadClassifier();
  deps.out(JSON.stringify(decideFastPath({ files, labels, freshness, classifier })));
  return 0;
}

// ---------------------------------------------------------------------------
// Real dependencies.
// ---------------------------------------------------------------------------

const gh = (args) => execFileSync("gh", args, { encoding: "utf-8" });

/** Import the built classifier; any failure yields `null` (fail closed). */
async function loadDistClassifier() {
  try {
    const mod = await import(pathToFileURL(DIST_ENTRY).href);
    const { qualifiesForLowRiskFastPath, reviewersForDiff, matchesGatePath } = mod;
    return [qualifiesForLowRiskFastPath, reviewersForDiff, matchesGatePath].every(
      (fn) => typeof fn === "function"
    )
      ? { qualifiesForLowRiskFastPath, reviewersForDiff, matchesGatePath }
      : null;
  } catch {
    return null;
  }
}

const realDeps = {
  getFiles: (pr) =>
    gh(["pr", "diff", pr, "--name-only"])
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean),
  getLabels: (pr) =>
    JSON.parse(gh(["pr", "view", pr, "--json", "labels"])).labels.map((l) => l.name),
  // Rebuild output goes to stderr so stdout stays a single JSON line.
  getFreshness: () =>
    ensureFreshAgentCoreBuild({
      exec: (cmd, args, opts) => execFileSync(cmd, args, { ...opts, stdio: ["ignore", 2, 2] }),
    }),
  loadClassifier: loadDistClassifier,
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(line),
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2), realDeps);
}
