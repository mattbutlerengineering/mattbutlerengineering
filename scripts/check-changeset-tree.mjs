#!/usr/bin/env node

/**
 * Fails when `changeset version` would error before it ever reaches the
 * Release workflow (#3322).
 *
 * Root cause of the incident this guards against: `packages/rialto`
 * declared `@mbe/api-client` (a `private: true` workspace-only package) as
 * a `peerDependencies` entry. `.changeset/config.json` has no
 * `privatePackages.version` override, so private packages are always
 * "skipped" for versioning (`@changesets/should-skip-package`). A
 * `dependencies`/`peerDependencies`/`optionalDependencies` edge onto a
 * skipped package makes the *depending* package's tree invalid unless it's
 * skipped too (`@changesets/config`'s `alsoSkipDependentsOfSkipped` rule)
 * — `devDependencies` edges are exempt. rialto is public and versioned by
 * design, so `changeset version` errored with "Invalid tree" on every push
 * to main once #5713 removed the NPM_TOKEN credential guard that used to
 * skip the step.
 *
 * First version of this check (#5721) shelled out to `changeset status` to
 * reuse @changesets/config's own validation. That broke on every CI PR:
 * `changeset status` runs `git merge-base main HEAD` internally, and a CI
 * PR checkout has no local `main` ref (only `origin/main`, detached at
 * `pull/N/merge`) — it only passed locally because this worktree happens
 * to share the main checkout's `main` branch. It also inherited
 * `changeset status`'s behavior around an empty `.changeset/` directory,
 * which is a different, unrelated concern (changeset *presence*, not tree
 * *validity*) this check has no business enforcing.
 *
 * This version replicates the actual rule directly over `package.json`
 * files instead: no git, no changesets CLI, so it can't depend on checkout
 * shape or pending-changeset state. It reads pnpm-workspace.yaml's globs
 * (via the same `dep-graph-discovery.mjs` every other workspace-enumerating
 * check in this repo uses) and `.changeset/config.json`'s `ignore` list,
 * nothing else.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { discoverWorkspaceGlobs, resolveGlob, root } from "./dep-graph-discovery.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

/** Dependency fields @changesets/config's tree validator treats as real edges. */
const NON_DEV_DEPENDENCY_FIELDS = ["dependencies", "peerDependencies", "optionalDependencies"];

/**
 * @typedef {object} WorkspacePackage
 * @property {string} name
 * @property {boolean} private
 * @property {Record<string, Set<string>>} deps - one Set per NON_DEV_DEPENDENCY_FIELDS entry
 */

/**
 * Every workspace package's name, privacy, and non-dev dependency edges.
 * Pure filesystem reads through pnpm-workspace.yaml's globs — no git, no
 * changesets CLI — so this is identical in a shallow CI PR checkout and
 * locally.
 *
 * @param {string} [repoRoot]
 * @returns {WorkspacePackage[]}
 */
export function loadWorkspacePackages(repoRoot = root) {
  const globs = discoverWorkspaceGlobs(repoRoot);
  return globs.flatMap((glob) =>
    resolveGlob(glob, repoRoot).map(({ pkgJsonPath }) => {
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      const deps = {};
      for (const field of NON_DEV_DEPENDENCY_FIELDS) {
        deps[field] = new Set(Object.keys(pkg[field] ?? {}));
      }
      return { name: pkg.name, private: pkg.private === true, deps };
    })
  );
}

/**
 * True when changesets would treat this package as "skipped" for
 * versioning — mirrors `@changesets/should-skip-package`'s
 * `shouldSkipPackage` (ignore or private; this repo never omits a version
 * field, so that third branch isn't replicated here).
 *
 * @param {WorkspacePackage} pkg
 * @param {string[]} ignore
 * @returns {boolean}
 */
function isSkipped(pkg, ignore) {
  return ignore.includes(pkg.name) || pkg.private;
}

/**
 * The direct rule `@changesets/config`'s `alsoSkipDependentsOfSkipped`
 * enforces: a non-skipped workspace package must not have a non-dev
 * dependency edge onto a package that IS skipped. `changeset version`
 * errors with "Invalid tree" the instant this is true — for any pending
 * changeset, or none at all. It's a standing structural property of the
 * package.json graph, not something the changesets CLI needs to compute.
 *
 * @param {object} input
 * @param {WorkspacePackage[]} input.packages
 * @param {string[]} input.ignore - `.changeset/config.json`'s `ignore` list
 * @returns {string[]} findings; empty means PASS
 */
export function findInvalidChangesetTreeEdges({ packages, ignore }) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const findings = [];

  for (const dependent of packages) {
    if (isSkipped(dependent, ignore)) continue;
    for (const field of NON_DEV_DEPENDENCY_FIELDS) {
      for (const depName of dependent.deps[field]) {
        const dependency = byName.get(depName);
        if (!dependency) continue; // not a workspace package; changesets doesn't track it
        if (!isSkipped(dependency, ignore)) continue;
        findings.push(
          `"${dependent.name}" depends on the skipped package "${depName}" via ` +
            `"${field}", but "${dependent.name}" is not skipped.`
        );
      }
    }
  }

  return findings;
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-changeset-tree.mjs");

if (isMain) {
  const { ignore = [] } = JSON.parse(
    readFileSync(join(root, ".changeset", "config.json"), "utf-8")
  );
  const packages = loadWorkspacePackages();
  const findings = findInvalidChangesetTreeEdges({ packages, ignore });

  process.exit(
    runCheck({
      name: "changeset tree validity",
      findings,
      formatFinding: (line) => line,
      passMessage: "PASS: changeset tree validity (`changeset version` would not error)",
      failMessage:
        "FAIL: `changeset version` would error before it reaches the Release workflow.\n" +
        "A public/versioned package has a dependencies/peerDependencies/optionalDependencies\n" +
        'edge onto a private or "ignore"d workspace package. Fix by moving the edge to\n' +
        "devDependencies if the depending package only needs it inside this workspace,\n" +
        "or by revisiting .changeset/config.json's ignore/privatePackages settings.\n" +
        "See .claude/rules/gotchas.md § Releases.",
    })
  );
}
