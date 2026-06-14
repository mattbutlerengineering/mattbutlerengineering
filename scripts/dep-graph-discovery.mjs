#!/usr/bin/env node

/**
 * Canonical dependency graph discovery module.
 *
 * Single source of truth for workspace + dependency discovery.
 * Both the JSON generator (generate-dep-graph.mjs) and the Mermaid/markdown
 * generator (generate-dep-graph.js) consume this module — no duplicate walks.
 *
 * Exports:
 *   classifyType(wsDir) → "app" | "service" | "package" | "tool"
 *   buildGraph()        → { nodes: Node[], edges: Edge[] }
 *
 * Types:
 *   Node  { name: string; type: string; path: string }
 *   Edge  { from: string; to: string; type: "dependency" | "devDependency" }
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const root = join(__dirname, "..");

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

/**
 * Build the full dependency graph from workspace packages.
 *
 * @returns {{ nodes: { name: string; type: string; path: string }[]; edges: { from: string; to: string; type: string }[] }}
 */
export function buildGraph() {
  const globs = discoverWorkspaceGlobs();
  const workspaces = globs.flatMap(resolveGlob);

  const nodes = [];
  const edges = [];
  const nameSet = new Set();

  // First pass: collect all nodes
  for (const { pkgJsonPath, wsDir } of workspaces) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (!pkg.name) continue;

    nodes.push({
      name: pkg.name,
      type: classifyType(wsDir),
      path: wsDir,
    });
    nameSet.add(pkg.name);
  }

  // Second pass: collect edges (only to known internal packages)
  for (const { pkgJsonPath } of workspaces) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (!pkg.name) continue;

    const deps = [
      ...collectInternalDeps(pkg.dependencies, "dependency"),
      ...collectInternalDeps(pkg.devDependencies, "devDependency"),
    ];

    for (const dep of deps) {
      if (nameSet.has(dep.name)) {
        edges.push({
          from: pkg.name,
          to: dep.name,
          type: dep.type,
        });
      }
    }
  }

  return { nodes, edges };
}
