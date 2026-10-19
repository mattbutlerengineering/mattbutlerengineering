// @vitest-environment node
/**
 * Static-source regression gate (#4843, inverted by #7102): the published
 * rialto package must import NO `@mbe/*` workspace package. Those are private
 * and never resolvable by registry consumers; the one historical edge
 * (ChatPanel -> the private API client) is now an injected `stream` prop.
 *
 * This scans SOURCE, not build output: Rollup silently inlines a resolvable,
 * un-externalized workspace package into the chunk, so a dist scan can look
 * green while shipping a private fork. See .claude/rules/gotchas.md § Releases.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

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

function findWorkspaceImports(): string[] {
  const specifiers: string[] = [];
  for (const file of listSourceFiles(SRC_DIR)) {
    const content = fs.readFileSync(file, "utf-8");
    for (const match of content.matchAll(WORKSPACE_IMPORT)) {
      specifiers.push(`${path.relative(RIALTO_ROOT, file)}: ${match[1]!}`);
    }
  }
  return specifiers;
}

describe("lib source: no workspace (@mbe/*) imports (#7102)", () => {
  it("scans a non-empty source tree, so this gate can't silently no-op", () => {
    expect(listSourceFiles(SRC_DIR).length).toBeGreaterThan(0);
  });

  it("packages/rialto/src imports no @mbe/* package", () => {
    expect(findWorkspaceImports()).toEqual([]);
  });

  it("package.json declares no @mbe/* dependency other than build config", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(RIALTO_ROOT, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const runtime = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
    expect(runtime.filter((n) => n.startsWith("@mbe/"))).toEqual([]);
  });
});
