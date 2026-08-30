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
 * needs `fetch-depth: 0` (same as migration-dry-run). On a push to main,
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

/* c8 ignore start -- thin CLI over the pure functions above; exercised via repo-audit */

/**
 * @param {string[]} args
 * @returns {string}
 */
function git(...args) {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

/** @returns {string} */
function resolveBase() {
  const override = process.env.RIALTO_CHANGESET_BASE;
  if (override) return git("rev-parse", "--verify", `${override}^{commit}`);
  return git("merge-base", "HEAD", "origin/main");
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-rialto-changeset.mjs");

if (isMain) {
  let base;
  try {
    base = resolveBase();
  } catch {
    process.exit(
      runCheck({
        name: "rialto changeset coverage",
        findings: ["merge-base(HEAD, origin/main) did not resolve"],
        formatFinding: (line) => line,
        failMessage:
          "FAIL: rialto changeset check could not resolve a diff base.\n" +
          "It needs `origin/main` and enough history for a merge base — in CI\n" +
          "that means `fetch-depth: 0` on the checkout; locally, `git fetch\n" +
          "origin main`. Set RIALTO_CHANGESET_BASE=<ref> to override.\n" +
          "Failing closed: a silently skipped gate reads exactly like a green one.",
      })
    );
  }

  const changedFiles = git("diff", "--name-only", base, "HEAD").split("\n").filter(Boolean);
  const changesets = git(
    "diff",
    "--name-only",
    "--diff-filter=AM",
    base,
    "HEAD",
    "--",
    ".changeset"
  )
    .split("\n")
    .filter((path) => path.endsWith(".md") && !path.endsWith("README.md"))
    .map((path) => ({ path, content: readFileSync(path, "utf-8") }));

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
