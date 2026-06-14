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
import { buildGraph, root } from "./dep-graph-discovery.mjs";

// Dirs included in the Mermaid view (infrastructure/* excluded — tool nodes
// from pnpm-workspace.yaml but not part of the inter-package visual graph).
const MERMAID_DIRS = ["apps", "services", "packages", "tools"];

const CLASSIFICATION_LABELS = {
  apps: "Frontend Apps",
  services: "Backend Services",
  packages: "Shared Packages",
  tools: "Developer Tools",
};

const TYPE_TO_CLASS = {
  app: "frontend",
  service: "backend",
  package: "shared",
  tool: "tooling",
};

/**
 * Derive the Mermaid node ID from a package name.
 * Mirrors the original logic: strip "@mbe/" prefix, replace "-" with "_".
 *
 * @param {string} name - Package name (e.g. "@mbe/agent-core")
 * @returns {string}
 */
function toMermaidId(name) {
  return name.replace("@mbe/", "").replace(/-/g, "_");
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
 * @param {{ nodes: { name: string; type: string; path: string }[]; edges: { from: string; to: string; type: string }[] }} graph
 * @returns {string}
 */
function generateMermaid(graph) {
  // Filter to nodes in the 4 standard dirs only
  const visibleNodes = graph.nodes.filter((n) => MERMAID_DIRS.includes(category(n.path)));
  const visibleNames = new Set(visibleNodes.map((n) => n.name));

  const lines = ["flowchart TD"];

  // Subgraphs by directory order
  for (const dir of MERMAID_DIRS) {
    const members = visibleNodes.filter((n) => category(n.path) === dir);
    if (members.length === 0) continue;

    lines.push(`  subgraph ${dir}["${CLASSIFICATION_LABELS[dir]}"]`);
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

  for (const node of visibleNodes) {
    lines.push(`  class ${toMermaidId(node.name)} ${TYPE_TO_CLASS[node.type]}`);
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
`;
}

// Run
const graph = buildGraph();
const mermaid = generateMermaid(graph);
const markdown = generateMarkdown(mermaid);
const outputPath = join(root, "docs", "architecture", "dependency-graph.md");

writeFileSync(outputPath, markdown);
console.log(`Generated dependency graph with ${graph.nodes.length} packages → ${outputPath}`);
