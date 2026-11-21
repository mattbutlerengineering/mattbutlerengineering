#!/usr/bin/env node

/**
 * Fails when a diff touches rialto's published source with no changeset.
 *
 * Commit e4c30808 shipped a public `classifyOverlap` prop, an `overlap`
 * field on every positioned bar, and a row-height behavior change in
 * `packages/rialto` with no `.changeset/` entry — so the next
 * `pnpm release` would have published all of it undocumented, under six
 * unrelated changelog entries. The gap was found by hand while writing an
 * unrelated ship record, which is not a detection mechanism. This check is
 * the detection mechanism (docs/backlog.md, maintenance:e2e-behind-edge-csp).
 *
 * What counts as changeset-worthy: files under `packages/rialto/src/**`
 * EXCEPT tests (`*.test.*` / `*.spec.*` / `__tests__/` / `src/test/**`),
 * stories (`*.stories.*`), the demo-only `src/showcase/**` (unreachable
 * from `lib-entry.ts`), and markdown. Everything else — components, hooks,
 * tokens, CSS modules, barrels — is inside the published `dist/lib` surface
 * (package.json `files` is `dist/lib` + `dist/manifest.json`), so a change
 * there is a change consumers receive on the next publish.
 *
 * What satisfies the gate: the same diff adds or modifies a
 * `.changeset/*.md` that either names `@mattbutlerengineering/rialto` or is
 * an explicit EMPTY changeset (`pnpm changeset --empty`) — the deliberate,
 * visible "no consumer-visible change here" declaration for comment-only
 * edits and pure internal refactors. The empty changeset is self-cleaning
 * (`changeset version` deletes it), so the escape hatch cannot accumulate
 * into a silent allowlist. Pre-existing pending changesets do NOT count:
 * only files added/modified in the diff, otherwise every PR free-rides on
 * someone else's pending entry.
 *
 * Base resolution (thin CLI): `RIALTO_CHANGESET_BASE` env override, else
 * `git merge-base HEAD origin/main`. An unresolvable base FAILS the check
 * (with the fix) rather than silently passing — a diff-based gate that
 * no-ops in a shallow clone is exactly the shipped-but-never-exercised
 * class this repo keeps rediscovering. CI's Build job checkout therefore
 * needs `fetch-depth: 0` (same as migration-dry-run). The failure is
 * attributed, not softened (#9203): a shallow clone, a missing origin/main
 * and an unreadable diff each print a distinct `BLOCKED:` message and exit
 * with a distinct non-zero code (`BLOCKED_EXIT_CODES`), so `pnpm repo-audit`
 * reports an environmental blocker as BLOCKED rather than as a changeset
 * violation — but it is never a pass and never a skip. On a push to main,
 * merge-base == HEAD, the diff is empty, and the check passes vacuously:
 * the gate does its work at PR time.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { runCheck } from "./lib/fitness-check.mjs";

export const RIALTO_PACKAGE = "@mattbutlerengineering/rialto";

const RELEASE_SOURCE_PREFIX = "packages/rialto/src/";
const NON_RELEASE_SUBTREES = ["packages/rialto/src/test/", "packages/rialto/src/showcase/"];
const NON_RELEASE_FILE_RE = /\.(test|spec|stories)\.[^/]+$|\.md$/;

/**
 * True when a repo-relative POSIX path is part of rialto's published
 * surface — i.e. a change there reaches consumers on the next publish.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isRialtoReleaseSource(path) {
  if (!path.startsWith(RELEASE_SOURCE_PREFIX)) return false;
  if (NON_RELEASE_SUBTREES.some((subtree) => path.startsWith(subtree))) return false;
  if (path.includes("/__tests__/")) return false;
  return !NON_RELEASE_FILE_RE.test(path);
}

/**
 * Package names in a changeset's YAML frontmatter.
 *
 * @param {string} content
 * @returns {string[] | null} Names (possibly empty, for an explicit empty
 *   changeset); null when the file has no frontmatter at all, so a
 *   malformed file can never satisfy the gate by accident.
 */
export function parseChangesetPackages(content) {
  const match = content.match(/^---\n([\s\S]*?)^---/m);
  if (!match) return null;
  const packages = [];
  for (const line of match[1].split("\n")) {
    const entry = line.match(/^\s*(?:"([^"]+)"|([^\s:"]+))\s*:/);
    if (entry) packages.push(entry[1] ?? entry[2]);
  }
  return packages;
}

/**
 * True when one changeset file's content satisfies the gate: it names
 * rialto, or it is an explicit empty changeset (the escape hatch).
 *
 * @param {string} content
 * @returns {boolean}
 */
export function changesetCoversRialto(content) {
  const packages = parseChangesetPackages(content);
  if (packages === null) return false;
  return packages.length === 0 || packages.includes(RIALTO_PACKAGE);
}

/**
 * The gate, as a pure decision.
 *
 * @param {object} input
 * @param {string[]} input.changedFiles - repo-relative paths changed in the diff
 * @param {{ path: string, content: string }[]} input.changesets -
 *   `.changeset/*.md` files (excluding README.md) added or modified in the
 *   same diff
 * @returns {{ findings: string[] }} The published-source paths left
 *   uncovered; empty means PASS.
 */
export function evaluateRialtoChangesetGate({ changedFiles, changesets }) {
  const releaseSources = changedFiles.filter(isRialtoReleaseSource);
  if (releaseSources.length === 0) return { findings: [] };
  const covered = changesets.some((cs) => changesetCoversRialto(cs.content));
  return { findings: covered ? [] : releaseSources };
}

export const FAIL_MESSAGE =
  "FAIL: this diff changes rialto's published source with no changeset.\n" +
  "Consumers of @mattbutlerengineering/rialto get these changes on the next\n" +
  "publish; without a changeset the changelog documents none of it (this is\n" +
  "how the TapeChart classifyOverlap API shipped silently — e4c30808).\n" +
  "Fix one of:\n" +
  "  pnpm changeset            # describe the change; pick rialto + the bump\n" +
  "  pnpm changeset --empty    # explicitly declare no consumer-visible change\n" +
  "Uncovered published-source files:";

/**
 * Exit codes for the environmental "blocked" outcomes. Every one is
 * non-zero (the gate never skips), and each is distinct from the plain `1`
 * of a real changeset violation so `scripts/run-repo-audit.mjs` can label
 * the line BLOCKED instead of a bare FAIL (#9203).
 */
export const BLOCKED_EXIT_CODES = {
  shallow: 10,
  "origin-main-missing": 11,
  "diff-unreadable": 12,
};

const OVERRIDE_HINT = "Or set RIALTO_CHANGESET_BASE=<ref> to name the base explicitly.";
const FAIL_CLOSED = "Failing closed: a silently skipped gate reads exactly like a green one.";

/**
 * Why the gate could not produce a verdict, as a pure decision over facts
 * the CLI gathers from git.
 *
 * @param {object} facts
 * @param {boolean} facts.isShallow - `git rev-parse --is-shallow-repository`
 * @param {boolean} facts.hasOriginMain - `origin/main` resolves to a commit
 * @param {boolean} facts.baseResolved - a base commit resolved (so the diff itself failed)
 * @param {boolean} facts.overrideSet - RIALTO_CHANGESET_BASE was provided
 * @returns {{ kind: string, exitCode: number, message: string }}
 */
export function classifyBaseFailure({ isShallow, hasOriginMain, baseResolved, overrideSet }) {
  if (baseResolved) {
    return {
      kind: "diff-unreadable",
      exitCode: BLOCKED_EXIT_CODES["diff-unreadable"],
      message:
        "BLOCKED: rialto changeset check (diff unreadable)\n" +
        "A diff base resolved but the diff against HEAD could not be read —\n" +
        "usually missing objects in a partial or shallow clone. Fetch the\n" +
        "history (`git fetch --unshallow --filter=blob:none origin main`) and re-run.\n" +
        FAIL_CLOSED,
    };
  }
  if (overrideSet) {
    return {
      kind: "override-unresolvable",
      exitCode: 1,
      message:
        "FAIL: RIALTO_CHANGESET_BASE does not resolve to a commit in this checkout.\n" +
        "Pass a ref or sha that exists locally, or unset it to use merge-base(HEAD, origin/main).\n" +
        FAIL_CLOSED,
    };
  }
  if (isShallow) {
    return {
      kind: "shallow",
      exitCode: BLOCKED_EXIT_CODES.shallow,
      message:
        "BLOCKED: rialto changeset check (shallow clone)\n" +
        "This checkout is a shallow clone, so merge-base(HEAD, origin/main)\n" +
        "cannot resolve. This is the checkout, not your diff. In an ephemeral\n" +
        "checkout (e.g. a cloud session) run:\n" +
        "  git fetch --unshallow --filter=blob:none origin main\n" +
        OVERRIDE_HINT +
        "\nCI uses `fetch-depth: 0`, so this does not occur there.\n" +
        FAIL_CLOSED,
    };
  }
  if (!hasOriginMain) {
    return {
      kind: "origin-main-missing",
      exitCode: BLOCKED_EXIT_CODES["origin-main-missing"],
      message:
        "BLOCKED: rialto changeset check (origin/main missing)\n" +
        "origin/main is missing from this checkout, so there is no diff base.\n" +
        "Run `git fetch origin main` (CI: `fetch-depth: 0`). " +
        OVERRIDE_HINT +
        "\n" +
        FAIL_CLOSED,
    };
  }
  return {
    kind: "no-merge-base",
    exitCode: 1,
    message:
      "FAIL: rialto changeset check could not resolve a diff base.\n" +
      "origin/main exists and the clone has full history, but HEAD shares no\n" +
      "merge base with it. Rebase onto origin/main. " +
      OVERRIDE_HINT +
      "\n" +
      FAIL_CLOSED,
  };
}

/* c8 ignore start -- thin CLI over the pure functions above; exercised via repo-audit */

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(...args) {
  return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * @param {string[]} args
 * @returns {string | null} trimmed stdout, or null when git exits non-zero
 */
function gitOutput(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

/** @returns {string} */
function resolveBase() {
  const override = process.env.RIALTO_CHANGESET_BASE;
  if (override) return git("rev-parse", "--verify", `${override}^{commit}`);
  return git("merge-base", "HEAD", "origin/main");
}

/**
 * Print the classified failure and exit non-zero. Never returns.
 *
 * @param {boolean} baseResolved
 * @returns {never}
 */
function failClosed(baseResolved) {
  const failure = classifyBaseFailure({
    isShallow: gitOutput("rev-parse", "--is-shallow-repository") === "true",
    hasOriginMain: gitOutput("rev-parse", "--verify", "origin/main^{commit}") !== null,
    baseResolved,
    overrideSet: Boolean(process.env.RIALTO_CHANGESET_BASE),
  });
  console.log(failure.message);
  process.exit(failure.exitCode);
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-rialto-changeset.mjs");

if (isMain) {
  let base;
  try {
    base = resolveBase();
  } catch {
    failClosed(false);
  }

  let changedFiles;
  let changesets;
  try {
    changedFiles = git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
    changesets = git("diff", "--name-only", "--diff-filter=AM", base, "HEAD", "--", ".changeset")
      .split("\n")
      .filter((path) => path.endsWith(".md") && !path.endsWith("README.md"))
      .map((path) => ({ path, content: readFileSync(path, "utf-8") }));
  } catch {
    failClosed(true);
  }

  const { findings } = evaluateRialtoChangesetGate({ changedFiles, changesets });

  process.exit(
    runCheck({
      name: "rialto changeset coverage",
      findings,
      formatFinding: (path) => path,
      passMessage: "PASS: rialto changeset coverage (published-source changes are covered)",
      failMessage: FAIL_MESSAGE,
    })
  );
}
/* c8 ignore stop */
