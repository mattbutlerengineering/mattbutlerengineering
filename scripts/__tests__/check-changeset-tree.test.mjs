/**
 * Unit tests for scripts/check-changeset-tree.mjs.
 *
 * Regression coverage for #3322/#5713/#5721-review: `changeset version`
 * (the Release workflow's "Version packages" step) errored with
 *
 *   Invalid tree: "@mattbutlerengineering/rialto" depends on the skipped
 *   package "@mbe/api-client", but "@mattbutlerengineering/rialto" is not
 *   skipped. Please add "@mattbutlerengineering/rialto" to the "ignore"
 *   option.
 *
 * on every push to main once #5713 removed the credential guard that used
 * to skip the step.
 *
 * The first version of this guard shelled out to `changeset status`, which
 * runs `git merge-base main HEAD` internally to decide what changed. A CI
 * PR checkout has no local `main` ref (only `origin/main`, detached at
 * `pull/N/merge`), so that failed on every PR with "Failed to find where
 * HEAD diverged from 'main'" — it only worked locally because this worktree
 * happens to share the main checkout's `main` branch. It also inherited
 * `changeset status`'s "no pending changesets" exit behavior, which would
 * have failed a test-only rialto PR once `.changeset/` empties out after a
 * release. This version fixes both by replicating the actual
 * `@changesets/config` rule (`alsoSkipDependentsOfSkipped`) directly over
 * `package.json` files — no git, no changesets CLI, so it can't depend on
 * checkout shape or pending-changeset state.
 */

import { describe, it, expect } from "vitest";
import { findInvalidChangesetTreeEdges, loadWorkspacePackages } from "../check-changeset-tree.mjs";
import { root } from "../dep-graph-discovery.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {Partial<{name: string, private: boolean, dependencies: string[], peerDependencies: string[], optionalDependencies: string[], devDependencies: string[]}>} overrides */
function pkg({
  name,
  private: isPrivate = false,
  dependencies = [],
  peerDependencies = [],
  optionalDependencies = [],
}) {
  return {
    name,
    private: isPrivate,
    deps: {
      dependencies: new Set(dependencies),
      peerDependencies: new Set(peerDependencies),
      optionalDependencies: new Set(optionalDependencies),
    },
  };
}

describe("findInvalidChangesetTreeEdges", () => {
  it("passes on a tree with no workspace edges at all", () => {
    const packages = [pkg({ name: "@mbe/a" }), pkg({ name: "@mbe/b" })];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: [] })).toEqual([]);
  });

  it("passes when a public package peer-depends on another public package", () => {
    const packages = [
      pkg({ name: "@mbe/a", peerDependencies: ["@mbe/b"] }),
      pkg({ name: "@mbe/b" }),
    ];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: [] })).toEqual([]);
  });

  it("BUG CASE: fails when a public package has a peerDependency on a private package (#3322)", () => {
    const packages = [
      pkg({ name: "@mattbutlerengineering/rialto", peerDependencies: ["@mbe/api-client"] }),
      pkg({ name: "@mbe/api-client", private: true }),
    ];
    const findings = findInvalidChangesetTreeEdges({ packages, ignore: [] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('"@mattbutlerengineering/rialto"');
    expect(findings[0]).toContain('"@mbe/api-client"');
    expect(findings[0]).toContain("peerDependencies");
  });

  it("DEV-ONLY EDGE: passes when the only edge onto a private package is a devDependency", () => {
    // devDependencies is never collected into `deps` at all (see
    // loadWorkspacePackages / NON_DEV_DEPENDENCY_FIELDS below) -- a
    // dev-only edge is structurally invisible to this rule, matching
    // @changesets/config's `ignoreDevDependencies: true`.
    const packages = [
      pkg({ name: "@mattbutlerengineering/rialto" }), // no dependencies/peerDependencies/optionalDependencies entries
      pkg({ name: "@mbe/api-client", private: true }),
    ];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: [] })).toEqual([]);
  });

  it("IGNORED PACKAGE: fails when a public package depends on a public package that's `ignore`d", () => {
    const packages = [
      pkg({ name: "@mbe/a", dependencies: ["@mbe/b"] }),
      pkg({ name: "@mbe/b" }), // not private
    ];
    const findings = findInvalidChangesetTreeEdges({ packages, ignore: ["@mbe/b"] });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain('"@mbe/a"');
    expect(findings[0]).toContain('"@mbe/b"');
  });

  it("passes when the dependent is itself skipped (private) too", () => {
    // Mirrors @changesets/config's `if (shouldSkipPackage(dependentPkg...)) continue`
    // -- two skipped packages depending on each other is not an "invalid tree".
    const packages = [
      pkg({ name: "@mbe/hospitality", private: true, dependencies: ["@mbe/api-client"] }),
      pkg({ name: "@mbe/api-client", private: true }),
    ];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: [] })).toEqual([]);
  });

  it("passes when the dependent is itself ignored, even though not private", () => {
    const packages = [
      pkg({ name: "@mbe/a", dependencies: ["@mbe/b"] }),
      pkg({ name: "@mbe/b", private: true }),
    ];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: ["@mbe/a"] })).toEqual([]);
  });

  it("ignores a dependency specifier that isn't a workspace package at all", () => {
    const packages = [pkg({ name: "@mbe/a", dependencies: ["left-pad"] })];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: [] })).toEqual([]);
  });

  it("reports one finding per offending edge, across multiple dependents", () => {
    const packages = [
      pkg({ name: "@mbe/a", dependencies: ["@mbe/shared"] }),
      pkg({ name: "@mbe/b", peerDependencies: ["@mbe/shared"] }),
      pkg({ name: "@mbe/shared", private: true }),
    ];
    expect(findInvalidChangesetTreeEdges({ packages, ignore: [] })).toHaveLength(2);
  });
});

describe("loadWorkspacePackages against the real repo", () => {
  it("finds real, known workspace packages with private flags read correctly", () => {
    const packages = loadWorkspacePackages(root);
    const byName = new Map(packages.map((p) => [p.name, p]));
    expect(byName.get("@mattbutlerengineering/rialto")?.private).toBe(false);
    expect(byName.get("@mbe/api-client")?.private).toBe(true);
  });
});

describe("check-changeset-tree against the real repo (regression + integration)", () => {
  it("reports zero findings for the actual current dependency graph", () => {
    const packages = loadWorkspacePackages(root);
    const { ignore = [] } = JSON.parse(
      readFileSync(join(root, ".changeset", "config.json"), "utf-8")
    );
    expect(findInvalidChangesetTreeEdges({ packages, ignore })).toEqual([]);
  });
});
