// @vitest-environment node
/**
 * Static-source regression gate for #4843: every `@mbe/*` workspace-package
 * import in packages/rialto/src must be covered by libExternal
 * (rollupOptions.external), and its package must be declared as a
 * peerDependency so registry consumers can resolve it.
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

describe("lib source: workspace (@mbe/*) imports (#4843)", () => {
  const specifiers = findWorkspaceImports();

  it("finds at least one @mbe/* import, so this gate can't silently no-op", () => {
    expect(specifiers.size).toBeGreaterThan(0);
  });

  it("every @mbe/* import in packages/rialto/src is covered by libExternal", () => {
    const uncovered = [...specifiers].filter((s) => !isExternalSpecifier(s));
    expect(uncovered).toEqual([]);
  });

  it("every @mbe/* import's package is declared as a peerDependency", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      peerDependencies?: Record<string, string>;
    };
    const peers = pkg.peerDependencies ?? {};
    const undeclared = [...specifiers].filter((s) => !(packageName(s) in peers));
    expect(undeclared).toEqual([]);
  });
});
