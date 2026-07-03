#!/usr/bin/env node

/**
 * Canonical dependency graph discovery module.
 *
 * Single source of truth for workspace + dependency discovery.
 * Both the JSON generator (generate-dep-graph.mjs) and the Mermaid/markdown
 * generator (generate-dep-graph.js) consume this module — no duplicate walks.
 *
 * Exports:
 *   classifyType(wsDir)          → "app" | "service" | "package" | "tool"
 *   scanScriptsImports(nameSet)  → Edge[]
 *   buildGraph()                 → { nodes: Node[], edges: Edge[] }
 *
 * Types:
 *   Node  { name: string; type: string; path: string; entrypoint?: true }
 *   Edge  { from: string; to: string; type: "dependency" | "devDependency" }
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = join(__dirname, "..");

// Packages with zero internal importers by design — invoked externally
// (CLI bin, MCP server config, editor/build plugin) rather than imported by
// another workspace package. Without this tag they're indistinguishable
// from dead code in the graph. Update when adding a new standalone tool.
export const ENTRYPOINT_PACKAGES = [
  "@mbe/mcp-server", // launched by path from .mcp.json, not package.json
  "@mbe/supply-chain-scanner", // invoked via its `mbe-scan` bin
  "@mbe/rialto-plugin", // Claude Code plugin, loaded outside the dep graph
];

/**
 * Classify a workspace path into a node type.
 *
 * @param {string} wsDir - Relative workspace directory (e.g. "apps/hospitality")
 * @returns {"app" | "service" | "package" | "tool"}
 */
export function classifyType(wsDir) {
  if (wsDir.startsWith("apps/")) return "app";
  if (wsDir.startsWith("services/")) return "service";
  if (wsDir.startsWith("packages/")) return "package";
  if (wsDir.startsWith("tools/")) return "tool";
  if (wsDir.startsWith("infrastructure/")) return "tool";
  return "package";
}

/**
 * Parse pnpm-workspace.yaml to discover workspace globs.
 * Only handles the simple `packages:` list format used by this repo.
 *
 * @returns {string[]} Array of glob patterns (e.g. ["apps/*", "infrastructure/pulumi"])
 */
function discoverWorkspaceGlobs() {
  const wsPath = join(root, "pnpm-workspace.yaml");
  if (!existsSync(wsPath)) {
    throw new Error("pnpm-workspace.yaml not found at project root");
  }

  const content = readFileSync(wsPath, "utf-8");
  const lines = content.split("\n");
  const globs = [];
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (trimmed.startsWith("- ")) {
        const glob = trimmed.slice(2).replace(/"/g, "").trim();
        globs.push(glob);
      } else if (trimmed !== "" && !trimmed.startsWith("#")) {
        break;
      }
    }
  }

  return globs;
}

/**
 * Resolve a workspace glob to actual package directories.
 * Handles both wildcard globs (e.g. "apps/*") and explicit paths
 * (e.g. "infrastructure/pulumi").
 *
 * @param {string} glob
 * @returns {{ pkgJsonPath: string; wsDir: string }[]}
 */
function resolveGlob(glob) {
  const results = [];

  if (glob.endsWith("/*")) {
    const parentDir = join(root, glob.slice(0, -2));
    if (!existsSync(parentDir)) return results;

    for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = join(parentDir, entry.name, "package.json");
      if (existsSync(pkgJsonPath)) {
        results.push({
          pkgJsonPath,
          wsDir: `${glob.slice(0, -2)}/${entry.name}`,
        });
      }
    }
  } else {
    const pkgJsonPath = join(root, glob, "package.json");
    if (existsSync(pkgJsonPath)) {
      results.push({ pkgJsonPath, wsDir: glob });
    }
  }

  return results;
}

/**
 * Collect internal @mbe/* / @mattbutlerengineering/* dependencies.
 *
 * @param {Record<string, string> | undefined} depsObj
 * @param {"dependency" | "devDependency"} depType
 * @returns {{ name: string; type: string }[]}
 */
function collectInternalDeps(depsObj, depType) {
  if (!depsObj) return [];
  return Object.keys(depsObj)
    .filter((name) => name.startsWith("@mbe/") || name.startsWith("@mattbutlerengineering/"))
    .map((name) => ({ name, type: depType }));
}

const SCRIPTS_SOURCE_EXTENSIONS = new Set([".js", ".mjs"]);
const SCRIPTS_EXCLUDED_DIRS = new Set(["node_modules", "__tests__", "generated"]);
const INTERNAL_IMPORT_PATTERN =
  /(?:from|require\()\s*["'](@mbe\/[a-z0-9-]+|@mattbutlerengineering\/[a-z0-9-]+)["']/g;

/**
 * Recursively collect scannable source files under a directory.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function collectSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SCRIPTS_EXCLUDED_DIRS.has(entry.name)) continue;
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
    } else if (SCRIPTS_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }
  return files;
}

/**
 * Scan scripts/ source files for `@mbe/*` / `@mattbutlerengineering/*`
 * import specifiers. scripts/ is a flat directory without per-file package
 * boundaries, so its package.json dependency list can silently drift from
 * what individual files actually import — unlike proper packages, whose
 * dependency arrays are the declared, lint-enforced contract. Excludes
 * __tests__ so test-only mocks don't inflate real runtime coupling.
 *
 * @param {Set<string>} nameSet - known internal package names
 * @returns {{ from: string; to: string; type: "dependency" }[]}
 */
export function scanScriptsImports(nameSet) {
  const files = collectSourceFiles(join(root, "scripts"));
  const targets = new Set();

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    for (const [, name] of content.matchAll(INTERNAL_IMPORT_PATTERN)) {
      if (nameSet.has(name) && name !== "@mbe/scripts") targets.add(name);
    }
  }

  return [...targets].map((to) => ({ from: "@mbe/scripts", to, type: "dependency" }));
}

/**
 * Build the full dependency graph from workspace packages.
 *
 * @returns {{ nodes: { name: string; type: string; path: string; entrypoint?: true }[]; edges: { from: string; to: string; type: string }[] }}
 */
export function buildGraph() {
  const globs = discoverWorkspaceGlobs();
  const workspaces = globs.flatMap(resolveGlob);

  const nodes = [];
  const edges = [];
  const edgeKeys = new Set();
  const nameSet = new Set();

  // First pass: collect all nodes
  for (const { pkgJsonPath, wsDir } of workspaces) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (!pkg.name) continue;

    const node = { name: pkg.name, type: classifyType(wsDir), path: wsDir };
    if (ENTRYPOINT_PACKAGES.includes(pkg.name)) node.entrypoint = true;

    nodes.push(node);
    nameSet.add(pkg.name);
  }

  // Second pass: collect edges declared in package.json (only to known
  // internal packages), deduplicated by from→to so a later source-scanned
  // edge covering the same pair never doubles up.
  const addEdge = (edge) => {
    const key = `${edge.from}→${edge.to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };

  for (const { pkgJsonPath } of workspaces) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (!pkg.name) continue;

    const deps = [
      ...collectInternalDeps(pkg.dependencies, "dependency"),
      ...collectInternalDeps(pkg.devDependencies, "devDependency"),
    ];

    for (const dep of deps) {
      if (nameSet.has(dep.name)) {
        addEdge({ from: pkg.name, to: dep.name, type: dep.type });
      }
    }
  }

  // Third pass: scripts/ has no per-file package boundaries, so also scan
  // its source imports directly rather than trusting scripts/package.json
  // alone to stay in sync with what individual files actually import.
  for (const edge of scanScriptsImports(nameSet)) {
    addEdge(edge);
  }

  return { nodes, edges };
}
