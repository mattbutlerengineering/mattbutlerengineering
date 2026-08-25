#!/usr/bin/env node

/**
 * publish-visual-diffs.mjs — the one impure edge of the visual-diffs feature.
 *
 * I/O and sequencing only, no decisions: read the Playwright report and the
 * config file it names, call the three pure modules, write the git objects,
 * push, execute the comment verb the comment module hands back, and write the
 * job summary. Every rule this file appears to follow lives somewhere a unit
 * test can reach it — ordering and the display cap in `visual-diff-comment`,
 * report and budget parsing in `visual-diff-report`, the ref namespace in
 * `visual-diff-refs`.
 *
 * Runs with bare `node` and no `node_modules`: the publisher job deliberately
 * runs no `pnpm install`, no build and no test, which is what makes SC-7/SC-8
 * true by construction. Nothing here may import a workspace package.
 *
 * Every shell-out is `execFileSync` with an argv array — never string
 * interpolation into a shell.
 */

import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMaxDiffPixels, parseVisualReport } from "./visual-diff-report.mjs";
import {
  COMMENT_MARKER_PREFIX,
  MAX_IMAGE_ROWS,
  blobName,
  decideCommentAction,
  parseCommentOrdinal,
  renderComment,
  selectDisplayed,
} from "./visual-diff-comment.mjs";
import { buildRefName, fullRef } from "./visual-diff-refs.mjs";

/** Everything the report writes for a run lands under this directory, and the
 * uploaded artifact's root IS that directory. */
const ARTIFACT_ROOT_MARKER = "/test-results/";

/**
 * The account this job's `GITHUB_TOKEN` comments as, and therefore the only
 * account whose comment may be treated as the standing one.
 *
 * Coupled deliberately to `rialto-web-e2e.yml`'s `GH_TOKEN: ${{ github.token }}`
 * — if the publisher is ever moved to a PAT or an App, this constant moves with
 * it. Failing that way is loud (the run stops recognising its own comment and
 * posts a second one); failing the other way is not.
 */
export const PUBLISHER_LOGIN = "github-actions[bot]";

/**
 * Pure: is this comment the one this feature owns?
 *
 * Both halves are load-bearing, and the author half is an **authorization**
 * check rather than a lookup convenience. This repo is public, so anyone who
 * can comment can post a body beginning with the marker; an author-blind lookup
 * adopts it, `decideCommentAction` reads whatever ordinal it declares, and a
 * marker claiming `run=99999999999999 attempt=99` makes every later run — the
 * failing ones included — return `skip` forever. The only trace would be one
 * skip note inside a green job's summary.
 *
 * @param {{login?: unknown, body?: unknown}|null|undefined} comment
 * @returns {boolean}
 */
export function isStandingComment(comment) {
  return (
    comment?.login === PUBLISHER_LOGIN &&
    typeof comment.body === "string" &&
    comment.body.startsWith(COMMENT_MARKER_PREFIX)
  );
}

// ---------------------------------------------------------------------------
// The budget hand-off
// ---------------------------------------------------------------------------

/**
 * Pure: the workspace-relative path of the Playwright config this run loaded,
 * or `null`.
 *
 * The path comes from the report's own `config.configFile` rather than a
 * hardcoded one, so the budget comes from the same config that produced the
 * counts — on a pull request that may have edited either. Both jobs run at
 * `GITHUB_WORKSPACE`, so the absolute path is re-rooted against it; a
 * `configFile` that is absent or escapes the workspace yields `null`, never a
 * fallback.
 *
 * @param {unknown} configFile
 * @param {unknown} workspace
 * @returns {string|null}
 */
export function resolvePlaywrightConfigPath(configFile, workspace) {
  if (typeof configFile !== "string" || configFile === "") return null;
  if (typeof workspace !== "string" || workspace === "") return null;

  const rel = relative(workspace, configFile);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
}

/**
 * Read the config as TEXT and hand it to the parser. Never `import()`: this job
 * runs no `pnpm install`, so `defineConfig` from `@playwright/test` is
 * unresolvable and importing the config would throw.
 *
 * Any failure — absent, escaping the workspace, not in the checkout,
 * unreadable — no-ops to `null` and the comment degrades. Never a substituted
 * default.
 *
 * @param {{configFile: unknown, workspace: unknown}} input
 * @returns {number|null}
 */
export function readBudget({ configFile, workspace }) {
  const rel = resolvePlaywrightConfigPath(configFile, workspace);
  if (rel === null) return null;
  try {
    return parseMaxDiffPixels(readFileSync(join(workspace, rel), "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Artifact path mapping
// ---------------------------------------------------------------------------

/**
 * Pure: where an image the report names lives inside the downloaded artifact.
 *
 * The report carries absolute runner paths; the artifact's root is the
 * `test-results` directory itself. Anything outside it — a committed baseline,
 * for instance — has no in-artifact location and yields `null`.
 *
 * @param {unknown} reportPath
 * @param {string} artifactDir
 * @returns {string|null}
 */
export function artifactFilePath(reportPath, artifactDir) {
  if (typeof reportPath !== "string") return null;
  const idx = reportPath.indexOf(ARTIFACT_ROOT_MARKER);
  if (idx === -1) return null;
  return join(artifactDir, reportPath.slice(idx + ARTIFACT_ROOT_MARKER.length));
}

/**
 * Pure: the blobs to publish for the displayed snapshots, named exactly as the
 * comment addresses them (both sides call `blobName`, so they cannot diverge).
 *
 * @param {Array<object>} displayed
 * @param {string} artifactDir
 * @returns {Array<{name: string, path: string}>}
 */
export function plannedImageFiles(displayed, artifactDir) {
  const files = [];
  for (const rec of displayed ?? []) {
    for (const reportPath of [rec.expectedPath, rec.actualPath, rec.diffPath]) {
      const local = artifactFilePath(reportPath, artifactDir);
      if (local === null) continue;
      files.push({ name: blobName(reportPath), path: local });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Git plumbing
// ---------------------------------------------------------------------------

function git(args, { cwd, env }) {
  return execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
}

/**
 * Build one orphan commit (no parents) carrying a flat tree of `files`.
 *
 * Uses plumbing against a TEMPORARY `GIT_INDEX_FILE`, so the runner's working
 * tree and index are never touched — the checkout this job shares with nothing
 * stays byte-identical, which `git status --porcelain` asserts in the test.
 *
 * @param {{files: Array<{name:string, path:string}>, message: string, cwd?: string}} input
 * @returns {string|null} The commit SHA, or `null` when there is nothing to publish.
 */
export function buildOrphanCommit({ files, message, cwd }) {
  if (!files || files.length === 0) return null;

  const indexDir = mkdtempSync(join(tmpdir(), "visual-diff-index-"));
  const env = {
    ...process.env,
    GIT_INDEX_FILE: join(indexDir, "index"),
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "github-actions[bot]",
    GIT_AUTHOR_EMAIL:
      process.env.GIT_AUTHOR_EMAIL ?? "41898282+github-actions[bot]@users.noreply.github.com",
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "github-actions[bot]",
    GIT_COMMITTER_EMAIL:
      process.env.GIT_COMMITTER_EMAIL ?? "41898282+github-actions[bot]@users.noreply.github.com",
  };

  try {
    for (const file of files) {
      const blob = git(["hash-object", "-w", "--", file.path], { cwd, env });
      git(["update-index", "--add", "--cacheinfo", `100644,${blob},${file.name}`], { cwd, env });
    }
    const tree = git(["write-tree"], { cwd, env });
    return git(["commit-tree", tree, "-m", message], { cwd, env });
  } finally {
    rmSync(indexDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// The comment verbs — executed, never decided
// ---------------------------------------------------------------------------

/**
 * Pure: the `gh` argv for one verb, or `null` for `skip`.
 *
 * The body is passed by file reference, never interpolated into an argument.
 *
 * @returns {Array<string>|null}
 */
export function commentArgs({ verb, repo, prNumber, commentId, bodyFile }) {
  switch (verb) {
    case "post":
      return [
        "api",
        `repos/${repo}/issues/${prNumber}/comments`,
        "-X",
        "POST",
        "-F",
        `body=@${bodyFile}`,
      ];
    case "patch":
      return [
        "api",
        `repos/${repo}/issues/comments/${commentId}`,
        "-X",
        "PATCH",
        "-F",
        `body=@${bodyFile}`,
      ];
    case "delete":
      return ["api", `repos/${repo}/issues/comments/${commentId}`, "-X", "DELETE"];
    default:
      return null;
  }
}

/**
 * Pure: may this verb be retried?
 *
 * The POST must not be. A failed POST that actually landed would double-post,
 * and two walls of images is a worse outcome than none; the next run's marker
 * lookup repairs it. The read, the PATCH and the DELETE are idempotent.
 */
export function isRetryable(verb) {
  return verb === "patch" || verb === "delete";
}

/**
 * Pure: the job-summary line every `skip` writes.
 *
 * Silence is exactly the property that made the delete path's version of this
 * bug invisible, and the note costs one line in a job nothing depends on. In
 * the one degenerate cell there is no standing ordinal to name, and the line
 * says so rather than omitting it.
 *
 * @param {{runOrdinal: object, standingBody: string|null}} input
 * @returns {string}
 */
export function formatSkipNote({ runOrdinal, standingBody }) {
  const ours = `run ${runOrdinal?.runId} attempt ${runOrdinal?.runAttempt}`;

  if (standingBody === null || standingBody === undefined) {
    return `Skipped: this run (${ours}) had nothing to do — no standing comment on this pull request.`;
  }

  const standing = parseCommentOrdinal(standingBody);
  if (standing === null) {
    return `Skipped: this run (${ours}) declined to act — the standing comment's ordinal is unreadable.`;
  }

  return (
    `Skipped: this run (${ours}) declined to act — the standing comment belongs to ` +
    `run ${standing.runId} attempt ${standing.runAttempt}, which is newer.`
  );
}

// ---------------------------------------------------------------------------
// CLI orchestration — side effects live below; everything above is testable.
// ---------------------------------------------------------------------------

const summary = [];

function note(line) {
  summary.push(line);
  console.log(line);
}

function flushSummary() {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path || summary.length === 0) return;
  appendFileSync(
    path,
    `\n## Visual diff publisher\n\n${summary.map((l) => `- ${l}`).join("\n")}\n`
  );
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

/**
 * The standing comment on this pull request, or `null`.
 *
 * The projection asks for `id`, `body` and `user.login` and the *decision* is
 * made by `isStandingComment` — a jq `select` cannot be unit-tested, and the
 * author clause it would carry is the one line stopping anyone with comment
 * access from suppressing this feature on a pull request.
 */
function findStandingComment(repo, prNumber) {
  const comments = gh([
    "api",
    `repos/${repo}/issues/${prNumber}/comments`,
    "--paginate",
    "--jq",
    ".[] | {id: .id, body: .body, login: .user.login}",
  ])
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const standing = comments.find(isStandingComment);
  return standing === undefined ? null : { id: standing.id, body: standing.body };
}

function executeVerb({ verb, repo, prNumber, standing, body }) {
  if (verb === "skip") return;

  const bodyDir = mkdtempSync(join(tmpdir(), "visual-diff-body-"));
  const bodyFile = join(bodyDir, "body.md");
  try {
    if (body !== null) writeFileSync(bodyFile, body);
    const args = commentArgs({ verb, repo, prNumber, commentId: standing?.id, bodyFile });
    if (args === null) return;

    try {
      gh(args);
    } catch (err) {
      if (!isRetryable(verb)) throw err;
      gh(args);
    }
    note(`Comment ${verb} succeeded.`);
  } finally {
    rmSync(bodyDir, { recursive: true, force: true });
  }
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const workspace = process.env.GITHUB_WORKSPACE;
  const prNumber = process.env.PR_NUMBER;
  const runOrdinal = {
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  };
  const visualFailed = process.env.VISUAL_OUTCOME !== "success";

  const standing = findStandingComment(repo, prNumber);
  const standingBody = standing?.body ?? null;

  // The success path never reads either artifact: the diffs artifact does not
  // exist on a passing run, and gating the clear behind it would leave a stale
  // failure comment standing (SC-5).
  if (!visualFailed) {
    const verb = decideCommentAction({ existingBody: standingBody, runOrdinal, visualFailed });
    if (verb === "skip") note(formatSkipNote({ runOrdinal, standingBody }));
    executeVerb({ verb, repo, prNumber, standing, body: null });
    return;
  }

  let report;
  try {
    report = JSON.parse(readFileSync(process.env.REPORT_FILE, "utf8"));
  } catch (err) {
    note(`No readable Playwright JSON report (${err.message}). Nothing published.`);
    return;
  }

  const { total, changed } = parseVisualReport(report);
  if (changed.length === 0) {
    // Never claim "0 of N changed" as though that were the finding.
    note(`The \`visual\` job failed, but the failure was not a snapshot diff — nothing to show.`);
    return;
  }

  const artifactDir = process.env.DIFF_ARTIFACT_DIR;
  const displayed = selectDisplayed(changed, MAX_IMAGE_ROWS);
  const files = plannedImageFiles(displayed, artifactDir).filter((f) => existsSync(f.path));

  if (files.length === 0) {
    note(
      `${changed.length} snapshot(s) changed, but no diff images were downloadable. Nothing published.`
    );
    return;
  }

  // The ref carries the ATTEMPT as well as the run id: a re-run keeps
  // GITHUB_RUN_ID and increments GITHUB_RUN_ATTEMPT, and a name built from the
  // id alone would have attempt 2 push at attempt 1's ref — rejected
  // non-fast-forward, and the one flag that would resolve it is forbidden here.
  const refName = buildRefName({
    prNumber,
    runId: runOrdinal.runId,
    runAttempt: runOrdinal.runAttempt,
  });
  const sha = buildOrphanCommit({
    files,
    message: `visual diffs for PR #${prNumber} (run ${runOrdinal.runId} attempt ${runOrdinal.runAttempt})`,
    cwd: workspace,
  });

  execFileSync("git", ["push", "origin", `${sha}:${fullRef(refName)}`], { cwd: workspace });
  note(`Published ${files.length} image(s) as ${sha} on \`${refName}\`.`);

  const body = renderComment({
    total,
    changed,
    budget: readBudget({ configFile: report?.config?.configFile, workspace }),
    sha,
    repoSlug: repo,
    runId: runOrdinal.runId,
    runAttempt: runOrdinal.runAttempt,
  });

  const verb = decideCommentAction({ existingBody: standingBody, runOrdinal, visualFailed });
  if (verb === "skip") note(formatSkipNote({ runOrdinal, standingBody }));
  executeVerb({ verb, repo, prNumber, standing, body });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .catch((err) => {
      note(`Publisher failed: ${err.message}`);
      flushSummary();
      process.exit(1);
    })
    .then(flushSummary);
}
