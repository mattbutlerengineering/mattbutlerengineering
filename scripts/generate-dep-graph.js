#!/usr/bin/env node

/**
 * Generates a Mermaid dependency graph of workspace packages.
 *
 * Consumes the canonical graph from dep-graph-discovery.mjs and transforms
 * it into a Mermaid flowchart written to docs/architecture/dependency-graph.md.
 * No second filesystem walk — discovery happens once in the shared module.
 *
 * Usage: node scripts/generate-dep-graph.js
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, root } from "./dep-graph-discovery.mjs";

// Dirs included in the Mermaid view (infrastructure/* excluded — tool nodes
// from pnpm-workspace.yaml but not part of the inter-package visual graph).
const MERMAID_DIRS = ["apps", "services", "packages", "tools", "scripts"];

const CLASSIFICATION_LABELS = {
  apps: "Frontend Apps",
  services: "Backend Services",
  packages: "Shared Packages",
  tools: "Developer Tools",
  scripts: "Automation Scripts",
};

// Mermaid ids must be unique across subgraphs AND nodes. The "scripts" dir
// bucket collides with the @mbe/scripts package's own node id (toMermaidId
// strips its "@mbe/" scope down to "scripts" too), so give that one bucket
// a distinct subgraph id while keeping its directory-derived grouping key.
const SUBGRAPH_IDS = { scripts: "scripts_dir" };

const TYPE_TO_CLASS = {
  app: "frontend",
  service: "backend",
  package: "shared",
  tool: "tooling",
};

/**
 * Derive the Mermaid node ID from a package name.
 * Strips the internal `@mbe/` scope or the external `@mattbutlerengineering/`
 * publish scope (see AGENTS.md's naming-exception note for `packages/rialto`),
 * then replaces "-" with "_" — Mermaid node IDs can't contain "@" or "/".
 *
 * @param {string} name - Package name (e.g. "@mbe/agent-core")
 * @returns {string}
 */
export function toMermaidId(name) {
  return name.replace("@mbe/", "").replace("@mattbutlerengineering/", "").replace(/-/g, "_");
}

/**
 * Derive the short label from a workspace path.
 *
 * @param {string} wsPath - Relative path (e.g. "packages/agent-core")
 * @returns {string}
 */
function shortName(wsPath) {
  return wsPath.split("/").pop();
}

/**
 * Return the top-level directory category from a workspace path.
 *
 * @param {string} wsPath - Relative path (e.g. "apps/hospitality")
 * @returns {string}
 */
function category(wsPath) {
  return wsPath.split("/")[0];
}

/**
 * Transform a canonical graph into a Mermaid flowchart string.
 *
 * @param {{ nodes: { name: string; type: string; path: string; entrypoint?: true }[]; edges: { from: string; to: string; type: string }[] }} graph
 * @returns {string}
 */
export function generateMermaid(graph) {
  // Filter to nodes in MERMAID_DIRS only
  const visibleNodes = graph.nodes.filter((n) => MERMAID_DIRS.includes(category(n.path)));
  const visibleNames = new Set(visibleNodes.map((n) => n.name));

  const lines = ["flowchart TD"];

  // Subgraphs by directory order
  for (const dir of MERMAID_DIRS) {
    const members = visibleNodes.filter((n) => category(n.path) === dir);
    if (members.length === 0) continue;

    const subgraphId = SUBGRAPH_IDS[dir] ?? dir;
    lines.push(`  subgraph ${subgraphId}["${CLASSIFICATION_LABELS[dir]}"]`);
    for (const node of members) {
      lines.push(`    ${toMermaidId(node.name)}["${shortName(node.path)}"]`);
    }
    lines.push("  end");
  }

  lines.push("");

  // Edges — only between visible nodes, deduplicated (dep + devDep edges
  // between the same pair collapse to one arrow in the Mermaid view)
  const seenEdges = new Set();
  for (const edge of graph.edges) {
    if (!visibleNames.has(edge.from) || !visibleNames.has(edge.to)) continue;
    const key = `${edge.from}→${edge.to}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    lines.push(`  ${toMermaidId(edge.from)} --> ${toMermaidId(edge.to)}`);
  }

  // Styling
  lines.push("");
  lines.push("  classDef frontend fill:#e0f2fe,stroke:#0284c7");
  lines.push("  classDef backend fill:#fef3c7,stroke:#d97706");
  lines.push("  classDef shared fill:#e0e7ff,stroke:#4f46e5");
  lines.push("  classDef tooling fill:#f0fdf4,stroke:#16a34a");
  lines.push("  classDef entrypoint fill:#fdf4ff,stroke:#a21caf,stroke-dasharray: 5 5");

  for (const node of visibleNodes) {
    const className = node.entrypoint ? "entrypoint" : TYPE_TO_CLASS[node.type];
    lines.push(`  class ${toMermaidId(node.name)} ${className}`);
  }

  return lines.join("\n");
}

/**
 * Wrap Mermaid in markdown document.
 *
 * @param {string} mermaid
 * @returns {string}
 */
function generateMarkdown(mermaid) {
  return `# Dependency Graph

> **Auto-generated** — do not edit manually.
> Regenerate with \`pnpm graph\`.

Inter-workspace dependency relationships between \`@mbe/*\` packages.

\`\`\`mermaid
${mermaid}
\`\`\`

## Legend

| Color | Category |
|-------|----------|
| Blue | Frontend Apps (\`apps/*\`) |
| Amber | Backend Services (\`services/*\`) |
| Indigo | Shared Packages (\`packages/*\`) |
| Green | Developer Tools (\`tools/*\`) |
| Purple (dashed) | Entrypoint package — invoked externally (CLI bin, MCP config, build plugin), so it has no internal importers by design |
`;
}

// Run only when executed directly (`node generate-dep-graph.js` / `pnpm graph`),
// not when imported for unit testing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const graph = buildGraph();
  const mermaid = generateMermaid(graph);
  const markdown = generateMarkdown(mermaid);
  const outputPath = join(root, "docs", "architecture", "dependency-graph.md");

  writeFileSync(outputPath, markdown);
  console.log(`Generated dependency graph with ${graph.nodes.length} packages → ${outputPath}`);
}
