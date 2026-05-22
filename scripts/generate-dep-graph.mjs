#!/usr/bin/env node

/**
 * Generates a JSON dependency graph of workspace packages.
 *
 * Parses pnpm-workspace.yaml and all package.json files, builds a graph
 * of nodes (packages/services/apps) and edges (internal @mbe/* deps),
 * and writes JSON to infrastructure/worker/dep-graph.json.
 *
 * Usage: node scripts/generate-dep-graph.mjs
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

/**
 * Parse pnpm-workspace.yaml to discover workspace globs.
 * Only handles the simple `packages:` list format used by this repo.
 * Returns an array of directory paths (resolved globs).
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
    // Stop when we hit a non-list-item line after entering packages
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
 * Classify a workspace path into a node type.
 */
function classifyType(wsDir) {
  if (wsDir.startsWith("apps/")) return "app";
  if (wsDir.startsWith("services/")) return "service";
  if (wsDir.startsWith("packages/")) return "package";
  if (wsDir.startsWith("tools/")) return "tool";
  if (wsDir.startsWith("infrastructure/")) return "tool";
  return "package";
}

/**
 * Resolve a workspace glob to actual package directories.
 * Handles both wildcard globs (e.g. "apps/*") and explicit paths
 * (e.g. "infrastructure/pulumi").
 */
function resolveGlob(glob) {
  const results = [];

  if (glob.endsWith("/*")) {
    // Wildcard — enumerate subdirectories
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
    // Explicit path
    const pkgJsonPath = join(root, glob, "package.json");
    if (existsSync(pkgJsonPath)) {
      results.push({ pkgJsonPath, wsDir: glob });
    }
  }

  return results;
}

/**
 * Collect internal @mbe/* dependencies from a deps object.
 * Returns array of { name, type } objects.
 */
function collectMbeDeps(depsObj, depType) {
  if (!depsObj) return [];
  return Object.keys(depsObj)
    .filter((name) => name.startsWith("@mbe/"))
    .map((name) => ({ name, type: depType }));
}

/**
 * Build the full dependency graph.
 * Returns { nodes: [...], edges: [...] }.
 */
function buildGraph() {
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
      ...collectMbeDeps(pkg.dependencies, "dependency"),
      ...collectMbeDeps(pkg.devDependencies, "devDependency"),
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

  return {
    nodes,
    edges,
  };
}

// ── Main ──────────────────────────────────────────────────────────────

const graph = buildGraph();
const outputPath = join(root, "infrastructure", "worker", "dep-graph.json");

writeFileSync(outputPath, JSON.stringify(graph, null, 2) + "\n");

console.log(
  `Generated dependency graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges → ${outputPath}`
);
