// @vitest-environment node
/**
 * Static-source regression gate for #4843: every `@mbe/*` workspace-package
 * import in packages/rialto/src must be covered by libExternal
 * (rollupOptions.external), and its package must be declared so registry
 * consumers know they have to provide it.
 *
 * This deliberately scans SOURCE, not build output. A build-output scan has
 * a real blind spot: if the imported workspace package happens to have a
 * resolvable dist/ on disk (e.g. because a sibling build already ran in the
 * same session), an un-externalized import doesn't fail the build or leave
 * a bare import statement behind to inspect — Rollup silently inlines it
 * into the chunk instead. That's the dangerous case (confirmed empirically
 * while building this gate): the lib build looks green locally while
 * shipping registry consumers a private fork of a workspace package they
 * can no longer independently update. Scanning source directly catches a
 * missing external entry regardless of what happens to exist on disk when
 * the build runs. See .claude/rules/gotchas.md § Releases and #3316.
 *
 * Declaration form depends on whether the imported package is itself
 * publishable (#3322). A `private: true` workspace package (like
 * `@mbe/api-client`) is never resolvable by a REAL external registry
 * consumer no matter what rialto's package.json says — `peerDependencies`
 * would be an unsatisfiable promise. Worse, `peerDependencies` is a real
 * dependency edge to `@changesets/config`'s tree validator, and a private
 * package is always "skipped" for versioning — so a public, versioned
 * package (rialto) declaring a peer dependency on one made `changeset
 * version` (and therefore the Release workflow) error with "Invalid tree"
 * on every push to main once #5713 stopped silently skipping the step. For
 * a private import, a `devDependency` is the honest declaration: it
 * documents that *this workspace package* needs it at build/test time,
 * without asserting a peer contract nothing outside the monorepo can ever
 * fulfill. A publishable `@mbe/*` import still requires `peerDependencies`
 * — the exception is scoped to unpublishable packages only.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { isExternalSpecifier } from "./lib-external.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RIALTO_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(RIALTO_ROOT, "src");

const WORKSPACE_IMPORT = /from\s+["'](@mbe\/[^"']+)["']/g;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

function findWorkspaceImports(): Set<string> {
  const specifiers = new Set<string>();
  for (const file of listSourceFiles(SRC_DIR)) {
    const content = fs.readFileSync(file, "utf-8");
    for (const match of content.matchAll(WORKSPACE_IMPORT)) {
      specifiers.add(match[1]);
    }
  }
  return specifiers;
}

/** "@mbe/api-client/streaming" -> "@mbe/api-client". */
function packageName(specifier: string): string {
  return specifier.split("/").slice(0, 2).join("/");
}

/**
 * True when a workspace package's own package.json marks it `private`,
 * i.e. it is never published to any registry and can never be a real
 * `peerDependencies` contract for an external consumer. Resolved through
 * rialto's own `node_modules` (a pnpm workspace symlink) so this reads the
 * package's actual, current manifest rather than assuming a directory
 * naming convention.
 */
function isPrivatePackage(name: string): boolean {
  const pkgJsonPath = path.join(RIALTO_ROOT, "node_modules", ...name.split("/"), "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as { private?: boolean };
  return pkg.private === true;
}

describe("lib source: workspace (@mbe/*) imports (#4843)", () => {
  const specifiers = findWorkspaceImports();

  it("finds at least one @mbe/* import, so this gate can't silently no-op", () => {
    expect(specifiers.size).toBeGreaterThan(0);
  });

  it("every @mbe/* import in packages/rialto/src is covered by libExternal", () => {
    const uncovered = [...specifiers].filter((s) => !isExternalSpecifier(s));
    expect(uncovered).toEqual([]);
  });

  it("every @mbe/* import's package is declared as a peerDependency, or as a devDependency when it's private and unpublishable (#3322)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const peers = pkg.peerDependencies ?? {};
    const devDeps = pkg.devDependencies ?? {};
    const undeclared = [...specifiers].filter((s) => {
      const name = packageName(s);
      if (name in peers) return false;
      if (isPrivatePackage(name) && name in devDeps) return false;
      return true;
    });
    expect(undeclared).toEqual([]);
  });

  it("does not let the private-package exception cover a publishable package with no declaration at all", () => {
    // Guards the exception itself: a specifier whose package is NOT private
    // must still fail when it's declared nowhere, exactly like before #3322.
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      peerDependencies?: Record<string, string>;
    };
    const publishablePeers = [...specifiers]
      .map(packageName)
      .filter((name) => !isPrivatePackage(name));
    for (const name of publishablePeers) {
      expect(pkg.peerDependencies ?? {}).toHaveProperty(name);
    }
  });

  it("@mbe/api-client is actually private, so the exception above is exercised and not vacuous", () => {
    expect(isPrivatePackage("@mbe/api-client")).toBe(true);
  });
});
