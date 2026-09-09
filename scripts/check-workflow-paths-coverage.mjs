#!/usr/bin/env node

/**
 * Fails when a workflow's `paths:`/`paths-ignore:` trigger filter can never
 * fire on a file that workflow's own jobs exercise.
 *
 * The defect class (docs/backlog.md, from maintenance:e2e-behind-edge-csp):
 * a CI guard whose trigger filter does not cover the surface it guards never
 * runs when that surface changes — and nothing goes red. The guard is checked
 * in, has real assertions, and pins nothing. F1 there was a CSP test that
 * would not have run when the CSP itself changed. Precedents of the same
 * shape: #3955 (six Playwright specs a workflow never invoked), #3911 (245
 * tests outside every workspace `test` script).
 *
 * What "exercised" means here — and the soundness stance:
 *
 * The exercised surface is derived ONLY from signals that are mechanically
 * attributable to the workflow text:
 *   1. repo-relative path tokens in `run:` blocks that name a git-tracked
 *      file or directory (shell-comment lines stripped, `${{ }}` expressions
 *      and URLs removed, `$VAR`-bearing tokens dropped);
 *   2. `pnpm --filter <pkg>` / `--filter=<pkg>` package names, mapped to
 *      their workspace directory (unknown names silently dropped);
 *   3. `pnpm --dir <path>` arguments and `working-directory:` values.
 *
 * A finding therefore reads: "this workflow demonstrably runs/reads path P,
 * and NO push/pull_request event of this workflow can ever fire on a change
 * to P" — i.e. the guard cannot run when the guarded surface changes. That
 * fail direction is sound. The pass direction is deliberately looser:
 *   - a directory counts as covered when ANY tracked file under it matches
 *     any pattern (partial coverage passes — e.g. `packages/rialto/src/**`
 *     covers an exercised `packages/rialto` even though `package.json`
 *     changes would not trigger);
 *   - transitive dependencies are NOT modeled (a workflow testing
 *     `apps/hospitality` exercises every package that app imports; only the
 *     named directory is required to be covered);
 *   - root-level files without a `/` (e.g. `CLAUDE.md` in a run block) are
 *     not extracted;
 *   - `.github/**` (composite actions, the workflow file itself) is excluded:
 *     requiring self-coverage would flag every filtered workflow at once;
 *   - job-level gating (dorny/paths-filter, `if:` conditions) is invisible
 *     here — this checks only whether the workflow RUN can be triggered;
 *   - `workflow_run` chains are not modeled (a workflow may also run when an
 *     upstream workflow completes; a gap reported on such a workflow may be
 *     recoverable through its upstream's filter — allowlist it with that
 *     reason if so);
 *   - a `pull_request` filter evaluates against the PR's cumulative
 *     base...head diff, so a PR that adds and then backs out a guarded
 *     surface stops triggering entirely (#4569 at d9ce41471). That is a
 *     property of a live PR's diff, not of the workflow text — statically
 *     undetectable here, tracked as its own docs/backlog.md seed.
 *
 * Workflows with a filtered change trigger but no extractable exercised
 * surface, and workflows using negation (`!`) patterns, are listed as NOT
 * verified rather than silently passing — a check that produces false
 * confidence is worse than no check.
 *
 * Usage: node scripts/check-workflow-paths-coverage.mjs
 * Exit code: 0 when every analyzable workflow is covered, 1 otherwise.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import { discoverWorkspaceGlobs, resolveGlob } from "./dep-graph-discovery.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Exercised paths a workflow's trigger filter deliberately does not cover.
 * Key: workflow filename. Value: map of exercised path -> one-line reason.
 * Every entry is a real, accepted instance of the defect class — each has a
 * docs/backlog.md seed so it is a debt with paperwork, not a silent pass.
 * A stale entry (gap no longer present) fails the check until removed.
 */
export const ALLOWLIST = {
  "deploy-services.yml": {
    "scripts/deploy-ci-precondition.mjs":
      "deploy gate helper; a change to it does not redeploy services — accepted, seeded in docs/backlog.md (session:2026-08-28)",
    "scripts/require-deploy-secrets.mjs":
      "deploy gate helper, same shape as deploy-ci-precondition.mjs above; adding it to the filter would make editing a script trigger a production deploy, which is not how a script change should be validated. Unlike the other entries here the guarded surface is NOT unwatched: scripts/__tests__/require-deploy-secrets.test.mjs reads the real deploy-services.yml and asserts the guard's env, its invocation and its per-service routing, and runs on every PR — so a break is caught before merge, just not by this workflow. Recorded in docs/fixes/backend-observability-blackout/breakdown.md (session:2026-09-02)",
  },
  "deploy-static.yml": {
    "scripts/collect-repo-stats.mjs":
      "always-exit-0 stats refresh; a change to it does not redeploy marketing — accepted, seeded in docs/backlog.md (session:2026-08-28)",
  },
  "instruction-regression.yml": {
    "plugins/acmm/scripts/evals/index.js":
      "the eval harness itself is outside the filter; a harness change runs no eval — seeded in docs/backlog.md (session:2026-08-28)",
  },
  "preview-deploy.yml": {
    "scripts/preview-comment.mjs":
      "comment-upsert helper; a change to it deploys no preview — accepted, seeded in docs/backlog.md (session:2026-08-28)",
  },
  "rialto-web-e2e.yml": {
    "scripts/publish-visual-diffs.mjs":
      "diff publisher (contents: write); a change to it runs no visual job — seeded in docs/backlog.md (session:2026-08-28)",
  },
};

/** Directory prefixes excluded from the exercised surface (see docblock). */
const EXCLUDED_PREFIXES = [".github/"];

/**
 * Convert a GitHub Actions path-filter pattern to an anchored RegExp.
 * GitHub semantics: `*` matches anything except `/`, `**` matches anything
 * including `/`, `?` matches one non-`/` character.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
export function githubPathPatternToRegExp(pattern) {
  let out = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

const CHANGE_EVENTS = new Set(["push", "pull_request", "pull_request_target"]);

/**
 * Parse the top-level `on:` block and return the change-triggered events with
 * their path filters. Only `push`/`pull_request`(`_target`) matter — schedule,
 * workflow_dispatch, workflow_run etc. are not fired by file changes.
 *
 * Indentation-based on purpose: these workflows are prettier-formatted block
 * YAML, and a `paths:` key inside an embedded `run:` script (see
 * visual-noise-floor.yml) must not be read as a trigger filter — anchoring on
 * the top-level `on:` section guarantees that.
 *
 * @param {string} workflowText
 * @returns {{ event: string, filterType: "paths"|"paths-ignore"|null, patterns: string[] }[]}
 */
export function parseTriggerEvents(workflowText) {
  const lines = workflowText.split("\n");
  const events = [];
  let inOn = false;
  let currentEvent = null;
  let currentFilter = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;

    if (/^on:\s*$/.test(line)) {
      inOn = true;
      continue;
    }
    // Flow-style triggers (`on: push`, `on: [push, pull_request]`) carry no
    // filters at all — every listed change event is unfiltered.
    const flow = line.match(/^on:\s*(.+)$/);
    if (flow) {
      const names = flow[1].replace(/[[\]]/g, "").split(",");
      for (const name of names) {
        const event = name.trim();
        if (CHANGE_EVENTS.has(event)) events.push({ event, filterType: null, patterns: [] });
      }
      continue;
    }
    if (!inOn) continue;
    // Any non-empty line at column 0 ends the on-block.
    if (trimmed !== "" && !/^\s/.test(line)) {
      inOn = false;
      currentEvent = null;
      currentFilter = null;
      continue;
    }

    const eventMatch = line.match(/^ {2}([\w-]+):\s*$/) ?? line.match(/^ {2}([\w-]+):\s*#.*$/);
    if (eventMatch) {
      currentFilter = null;
      if (CHANGE_EVENTS.has(eventMatch[1])) {
        currentEvent = { event: eventMatch[1], filterType: null, patterns: [] };
        events.push(currentEvent);
      } else {
        currentEvent = null;
      }
      continue;
    }

    if (!currentEvent) continue;

    const filterMatch = line.match(/^ {4}(paths|paths-ignore):\s*$/);
    if (filterMatch) {
      currentFilter = filterMatch[1];
      currentEvent.filterType = currentFilter;
      continue;
    }
    if (/^ {4}[\w-]+:/.test(line)) {
      currentFilter = null; // some other event sub-key (branches, types, ...)
      continue;
    }
    if (currentFilter) {
      const item = line.match(/^\s+-\s+(.+?)\s*$/);
      if (item) {
        currentEvent.patterns.push(item[1].replace(/^["']|["']$/g, ""));
      }
    }
  }
  return events;
}

/**
 * Collect the text of every `run:` scalar (single-line and block) plus every
 * `working-directory:` value from a workflow.
 *
 * @param {string} workflowText
 * @returns {{ runLines: string[], workingDirectories: string[] }}
 */
function collectRunText(workflowText) {
  const lines = workflowText.split("\n");
  const runLines = [];
  const workingDirectories = [];
  let blockIndent = null;

  for (const line of lines) {
    if (blockIndent !== null) {
      if (line.trim() === "") continue;
      const indent = line.match(/^ */)[0].length;
      if (indent > blockIndent) {
        runLines.push(line.trim());
        continue;
      }
      blockIndent = null;
    }
    const runBlock = line.match(/^(\s*)(?:-\s+)?run:\s*[|>][+-]?\s*$/);
    if (runBlock) {
      blockIndent = line.match(/^ */)[0].length;
      continue;
    }
    const runInline = line.match(/^\s*(?:-\s+)?run:\s+(?![|>])(.+)$/);
    if (runInline) {
      runLines.push(runInline[1].trim());
      continue;
    }
    const wd = line.match(/^\s*working-directory:\s+(.+?)\s*$/);
    if (wd) {
      workingDirectories.push(wd[1].replace(/^["']|["']$/g, ""));
    }
  }
  return { runLines, workingDirectories };
}

/** True when `p` is a tracked file or a directory containing tracked files. */
function isTrackedPath(p, trackedSet, trackedFiles) {
  if (trackedSet.has(p)) return true;
  const prefix = `${p}/`;
  return trackedFiles.some((f) => f.startsWith(prefix));
}

const PATH_TOKEN_RE = /(?<![\w/@.-])((?:[\w.-]+\/)+[\w.-]+)/g;
const FILTER_ARG_RE = /--filter[= ]["']?([^\s"']+)/g;
const DIR_ARG_RE = /--dir[= ]["']?([^\s"']+)/g;

/**
 * Derive the exercised surface of a workflow. See the module docblock for
 * exactly which signals are read and which are deliberately not.
 *
 * @param {string} workflowText
 * @param {{ trackedFiles: string[], packageDirs: Record<string, string> }} ctx
 * @returns {{ path: string, via: string }[]} sorted, deduplicated
 */
export function extractExercisedPaths(workflowText, { trackedFiles, packageDirs }) {
  const trackedSet = new Set(trackedFiles);
  const { runLines, workingDirectories } = collectRunText(workflowText);
  /** @type {Map<string, string>} */
  const found = new Map();

  const add = (p, via) => {
    const clean = p.replace(/\/+$/, "");
    if (EXCLUDED_PREFIXES.some((pre) => clean === pre.slice(0, -1) || clean.startsWith(pre)))
      return;
    if (!isTrackedPath(clean, trackedSet, trackedFiles)) return;
    if (!found.has(clean)) found.set(clean, via);
  };

  for (const rawLine of runLines) {
    if (rawLine.startsWith("#")) continue; // shell comment
    const line = rawLine.replace(/\$\{\{[^}]*\}\}/g, " ").replace(/\S+:\/\/\S+/g, " "); // URLs

    for (const m of line.matchAll(FILTER_ARG_RE)) {
      const name = m[1]
        .replace(/^\^/, "")
        .replace(/^\.\.\./, "")
        .replace(/\.\.\.$/, "");
      const dir = packageDirs[name];
      if (dir) add(dir, `--filter ${name}`);
    }
    for (const m of line.matchAll(DIR_ARG_RE)) {
      if (!m[1].includes("$")) add(m[1], "--dir");
    }
    for (const m of line.matchAll(PATH_TOKEN_RE)) {
      if (m[1].includes("$")) continue;
      add(m[1], "run block");
    }
  }
  for (const wd of workingDirectories) {
    if (!wd.includes("$") && !wd.includes("{")) add(wd, "working-directory");
  }

  return [...found.entries()]
    .map(([path, via]) => ({ path, via }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * Can a change to `path` (a tracked file, or a directory of tracked files)
 * ever fire the given event filter?
 */
function pathTriggersEvent(path, event, trackedSet, trackedFiles) {
  const files = trackedSet.has(path)
    ? [path]
    : trackedFiles.filter((f) => f.startsWith(`${path}/`));
  const regexes = event.patterns.map(githubPathPatternToRegExp);
  if (event.filterType === "paths") {
    return files.some((f) => regexes.some((re) => re.test(f)));
  }
  // paths-ignore: a change fires unless every changed file is ignored.
  return files.some((f) => !regexes.some((re) => re.test(f)));
}

/**
 * Evaluate one workflow: is every exercised path triggerable by at least one
 * change event?
 *
 * @param {{ workflowText: string, trackedFiles: string[], packageDirs: Record<string,string> }} input
 * @returns {{
 *   changeTriggered: boolean,
 *   analyzable: boolean,
 *   reason: string|null,
 *   exercised: { path: string, via: string }[],
 *   gaps: { path: string, via: string }[],
 * }}
 */
export function evaluateWorkflowCoverage({ workflowText, trackedFiles, packageDirs }) {
  const events = parseTriggerEvents(workflowText);
  const none = { exercised: [], gaps: [] };
  if (events.length === 0) {
    return { changeTriggered: false, analyzable: false, reason: "not change-triggered", ...none };
  }
  if (events.some((e) => e.filterType === null)) {
    return {
      changeTriggered: true,
      analyzable: false,
      reason: "an unfiltered change event runs on every file",
      ...none,
    };
  }
  if (events.some((e) => e.patterns.some((p) => p.startsWith("!")))) {
    return {
      changeTriggered: true,
      analyzable: false,
      reason: "negation patterns are not modeled",
      ...none,
    };
  }

  const trackedSet = new Set(trackedFiles);
  const exercised = extractExercisedPaths(workflowText, { trackedFiles, packageDirs });
  const gaps = exercised.filter(
    ({ path }) => !events.some((e) => pathTriggersEvent(path, e, trackedSet, trackedFiles))
  );
  return { changeTriggered: true, analyzable: true, reason: null, exercised, gaps };
}

/** Repo-relative POSIX paths of every git-tracked file. */
export function listTrackedFiles(root = DEFAULT_ROOT) {
  return execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\n")
    .filter(Boolean);
}

/** Map of workspace package name -> repo-relative directory. */
export function discoverPackageDirs(root = DEFAULT_ROOT) {
  /** @type {Record<string, string>} */
  const dirs = {};
  for (const glob of discoverWorkspaceGlobs(root)) {
    for (const { pkgJsonPath, wsDir } of resolveGlob(glob, root)) {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      if (pkg.name) dirs[pkg.name] = wsDir;
    }
  }
  return dirs;
}

/**
 * Audit every workflow. Pure given its inputs, so the vitest suite can run it
 * against the real tree and fixtures alike.
 *
 * @param {{
 *   root: string,
 *   trackedFiles: string[],
 *   packageDirs: Record<string, string>,
 *   allowlist?: Record<string, Record<string, string>>,
 * }} input
 * @returns {{
 *   findings: { workflow: string, path: string, via: string }[],
 *   staleAllowlist: string[],
 *   notAnalyzable: { workflow: string, reason: string }[],
 *   allowlisted: { workflow: string, path: string, reason: string }[],
 *   analyzed: string[],
 * }}
 */
export function runAudit({ root, trackedFiles, packageDirs, allowlist = ALLOWLIST }) {
  const workflowsDir = join(root, ".github", "workflows");
  const findings = [];
  const notAnalyzable = [];
  const allowlisted = [];
  const analyzed = [];
  const liveAllowlistHits = new Set();

  const workflowFiles = existsSync(workflowsDir)
    ? readdirSync(workflowsDir)
        .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
        .sort()
    : [];

  for (const workflow of workflowFiles) {
    const workflowText = readFileSync(join(workflowsDir, workflow), "utf-8");
    const result = evaluateWorkflowCoverage({ workflowText, trackedFiles, packageDirs });
    if (!result.changeTriggered) continue;
    if (!result.analyzable) {
      notAnalyzable.push({ workflow, reason: result.reason });
      continue;
    }
    if (result.exercised.length === 0) {
      notAnalyzable.push({ workflow, reason: "no extractable exercised surface" });
      continue;
    }
    analyzed.push(workflow);
    for (const gap of result.gaps) {
      const reason = allowlist[workflow]?.[gap.path];
      if (reason) {
        allowlisted.push({ workflow, path: gap.path, reason });
        liveAllowlistHits.add(`${workflow}::${gap.path}`);
      } else {
        findings.push({ workflow, path: gap.path, via: gap.via });
      }
    }
  }

  const staleAllowlist = Object.entries(allowlist).flatMap(([workflow, paths]) =>
    Object.keys(paths)
      .filter((path) => !liveAllowlistHits.has(`${workflow}::${path}`))
      .map((path) => `${workflow}: ${path}`)
  );

  return { findings, staleAllowlist, notAnalyzable, allowlisted, analyzed };
}

function main() {
  const root = DEFAULT_ROOT;
  const { findings, staleAllowlist, notAnalyzable, allowlisted, analyzed } = runAudit({
    root,
    trackedFiles: listTrackedFiles(root),
    packageDirs: discoverPackageDirs(root),
  });

  console.log(`Analyzed (filter verified against exercised surface): ${analyzed.join(", ")}`);
  const unfiltered = notAnalyzable.filter((n) => n.reason.startsWith("an unfiltered"));
  const unverified = notAnalyzable.filter((n) => !n.reason.startsWith("an unfiltered"));
  if (unfiltered.length > 0) {
    console.log(
      `Trivially covered (an unfiltered change event runs on every file): ${unfiltered
        .map((n) => n.workflow)
        .join(", ")}`
    );
  }
  if (unverified.length > 0) {
    console.log("NOT verified (listed explicitly rather than silently passing):");
    for (const { workflow, reason } of unverified) {
      console.log(`  ${workflow} — ${reason}`);
    }
  }
  if (allowlisted.length > 0) {
    console.log("Known, accepted gaps (ALLOWLIST — each has a docs/backlog.md seed):");
    for (const { workflow, path, reason } of allowlisted) {
      console.log(`  ${workflow}: ${path} — ${reason}`);
    }
  }

  const issues = [
    ...findings.map(
      (f) =>
        `${f.workflow} exercises ${f.path} (via ${f.via}) but its paths filter can never fire on a change to it — the guard will not run when the guarded surface changes`
    ),
    ...staleAllowlist.map((s) => `stale ALLOWLIST entry (gap no longer present): ${s}`),
  ];
  process.exit(
    runCheck({
      name: "workflow paths-filter coverage",
      findings: issues,
      formatFinding: (line) => line,
    })
  );
}

const isDirectExecution =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isDirectExecution) main();
