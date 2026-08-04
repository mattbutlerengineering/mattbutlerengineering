#!/usr/bin/env node
/**
 * `node scripts/lib/file-issue-cli.mjs` — a shell-callable front door onto
 * `fileIssue()` (#3672) for the producers that can't `import` it directly:
 * GitHub Actions workflow steps (plain shell) and `scripts/audit/live-sweep.sh`
 * (bash, not Node).
 *
 * Deliberately zero npm dependencies (only `node:*` builtins + the sibling
 * `issue-filing.mjs`) so it runs in any workflow that has already checked the
 * repo out — no `pnpm install` step required, matching the ACMM producer's
 * `execFileSync`-backed `gh` calls (#3762) rather than `@mbe/gh-client`.
 *
 * Usage:
 *   node scripts/lib/file-issue-cli.mjs \
 *     --title "<title>" \
 *     --body "<text>" | --body-file <path> \
 *     --dedupe-key "<key>" \
 *     [--label <label> ...] \
 *     [--search-label <label> ...] [--search-state open|all] \
 *     [--contains "<substring>"] [--search-text "<gh --search query>"]
 *
 * Prints one JSON line to stdout: {"action":"create"|"skip"|"reopen","issueNumber":123}
 *
 * Omitting every `--search-label` skips the dedupe lookup entirely (ledger
 * stays empty, always creates) — for the handful of call sites that
 * deliberately have no dedup today and aren't part of this migration's
 * behavior-change scope.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fileIssue } from "./issue-filing.mjs";

const FLAGS_WITH_VALUE = new Set([
  "--title",
  "--body",
  "--body-file",
  "--label",
  "--dedupe-key",
  "--search-label",
  "--search-state",
  "--contains",
  "--search-text",
]);

/**
 * @param {string[]} argv
 * @returns {{
 *   title: string, body: string|null, bodyFile: string|null, labels: string[],
 *   dedupeKey: string, searchLabels: string[], searchState: "open"|"all",
 *   contains: string|null, searchText: string|null,
 * }}
 */
export function parseArgs(argv) {
  const opts = {
    title: null,
    body: null,
    bodyFile: null,
    labels: [],
    dedupeKey: null,
    searchLabels: [],
    searchState: "open",
    contains: null,
    searchText: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!FLAGS_WITH_VALUE.has(flag)) {
      throw new Error(`Unknown flag: ${flag}`);
    }
    const value = argv[i + 1];
    i += 1;

    if (flag === "--label") opts.labels.push(value);
    else if (flag === "--search-label") opts.searchLabels.push(value);
    else if (flag === "--title") opts.title = value;
    else if (flag === "--body") opts.body = value;
    else if (flag === "--body-file") opts.bodyFile = value;
    else if (flag === "--dedupe-key") opts.dedupeKey = value;
    else if (flag === "--search-state") opts.searchState = value;
    else if (flag === "--contains") opts.contains = value;
    else if (flag === "--search-text") opts.searchText = value;
  }

  if (!opts.title) throw new Error("--title is required");
  if (!opts.body && !opts.bodyFile) throw new Error("--body or --body-file is required");
  if (!opts.dedupeKey) throw new Error("--dedupe-key is required");

  return opts;
}

/**
 * Pure: picks the "prior" issue for dedup purposes out of a set of candidate
 * issues already fetched by `deps.searchIssues`. When `contains` is given,
 * only candidates whose title includes that substring qualify (mirrors the
 * client-side `jq 'select(.title | contains(...))'` filters producers used
 * to hand-roll); otherwise the first candidate wins (mirrors the
 * `--jq '.[0].number'` / count-based checks).
 *
 * @param {Array<{number: number, title: string}>} issues
 * @param {{ contains?: string|null }} opts
 * @returns {number | null}
 */
export function findPriorIssueNumber(issues, { contains } = {}) {
  const candidates = contains ? issues.filter((issue) => issue.title.includes(contains)) : issues;
  return candidates.length > 0 ? candidates[0].number : null;
}

/**
 * @typedef {Object} FileIssueCliDeps
 * @property {(path: string) => string} readFile
 * @property {(opts: { labels: string[], state: string, searchText: string|null }) => Array<{number: number, title: string}>} searchIssues
 * @property {(issueNumber: number) => "open"|"closed"|"missing"} getIssueState
 * @property {(title: string, body: string, labels: string[]) => number} createIssue
 * @property {(issueNumber: number) => void} reopenIssue
 */

/**
 * @param {string[]} argv
 * @param {FileIssueCliDeps} deps
 * @returns {{ action: "create"|"skip"|"reopen", issueNumber: number }}
 */
export function runFileIssueCli(argv, deps) {
  const opts = parseArgs(argv);
  const body = opts.body ?? deps.readFile(opts.bodyFile);

  let priorNumber = null;
  if (opts.searchLabels.length > 0) {
    // A failed search is treated as "no prior found" (create fresh) rather
    // than aborting — every inline dedup implementation this CLI replaces
    // failed open the same way, via bash's default non-strict handling of a
    // failed `gh issue list` (empty/unset variable, `if [ -n ... ]` false,
    // falls through to create) or an explicit `2>/dev/null || echo`.
    let issues = [];
    try {
      issues = deps.searchIssues({
        labels: opts.searchLabels,
        state: opts.searchState,
        searchText: opts.searchText,
      });
    } catch (err) {
      process.stderr.write(
        `[file-issue-cli] search failed, proceeding as no-match: ${err.message}\n`
      );
    }
    priorNumber = findPriorIssueNumber(issues, { contains: opts.contains });
  }

  const ledger = priorNumber !== null ? { [opts.dedupeKey]: priorNumber } : {};

  const result = fileIssue(
    { title: opts.title, body, labels: opts.labels, dedupeKey: opts.dedupeKey },
    ledger,
    {
      getIssueState: deps.getIssueState,
      createIssue: deps.createIssue,
      reopenIssue: deps.reopenIssue,
    }
  );

  return { action: result.action, issueNumber: result.issueNumber };
}

/** Real deps: raw `gh` CLI via execFileSync — no npm dependencies. */
function createRealDeps() {
  const run = (args) => execFileSync("gh", args, { encoding: "utf-8", timeout: 30_000 }).trim();

  return {
    readFile: (path) => readFileSync(path, "utf-8"),

    searchIssues({ labels, state, searchText }) {
      const args = ["issue", "list", "--state", state, "--json", "number,title"];
      for (const label of labels) args.push("--label", label);
      if (searchText) args.push("--search", searchText);
      return JSON.parse(run(args));
    },

    getIssueState(issueNumber) {
      try {
        const raw = run(["issue", "view", String(issueNumber), "--json", "state"]);
        const state = String(JSON.parse(raw).state).toLowerCase();
        return state === "open" ? "open" : state === "closed" ? "closed" : "missing";
      } catch {
        return "missing";
      }
    },

    createIssue(title, body, labels) {
      const args = ["issue", "create", "--title", title, "--body", body];
      for (const label of labels) args.push("--label", label);
      const url = run(args);
      const match = url.match(/\/issues\/(\d+)\s*$/);
      if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
      return parseInt(match[1], 10);
    },

    reopenIssue(issueNumber) {
      run(["issue", "reopen", String(issueNumber)]);
    },
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const result = runFileIssueCli(process.argv.slice(2), createRealDeps());
  console.log(JSON.stringify(result));
}
