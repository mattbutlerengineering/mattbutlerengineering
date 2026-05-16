#!/usr/bin/env node

/**
 * Generates a Mermaid dependency graph of workspace packages.
 *
 * Reads every package.json in the monorepo, extracts inter-workspace
 * dependencies, and writes a Mermaid flowchart to
 * docs/architecture/dependency-graph.md.
 *
 * Usage: node scripts/generate-dep-graph.js
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const WORKSPACE_DIRS = ["apps", "services", "packages", "tools"];

const CLASSIFICATION_LABELS = {
  apps: "Frontend Apps",
  services: "Backend Services",
  packages: "Shared Packages",
  tools: "Developer Tools",
};

function discoverPackages() {
  const packages = new Map();

  for (const dir of WORKSPACE_DIRS) {
    const fullDir = join(root, dir);
    if (!existsSync(fullDir)) continue;

    for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const pkgPath = join(fullDir, entry.name, "package.json");
      if (!existsSync(pkgPath)) continue;

      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (!pkg.name) continue;

      const mbeDeps = Object.keys({
        ...pkg.dependencies,
        ...pkg.devDependencies,
      }).filter((name) => name.startsWith("@mbe/"));

      packages.set(pkg.name, {
        deps: mbeDeps,
        dir: `${dir}/${entry.name}`,
        category: dir,
        shortName: entry.name,
      });
    }
  }

  return packages;
}

function toMermaidId(name) {
  return name.replace("@mbe/", "").replace(/-/g, "_");
}

function generateMermaid(packages) {
  const lines = ["flowchart TD"];

  // Group packages by category into subgraphs
  for (const dir of WORKSPACE_DIRS) {
    const members = [...packages.entries()].filter(
      ([, info]) => info.category === dir
    );
    if (members.length === 0) continue;

    lines.push(`  subgraph ${dir}["${CLASSIFICATION_LABELS[dir]}"]`);
    for (const [name, info] of members) {
      lines.push(`    ${toMermaidId(name)}["${info.shortName}"]`);
    }
    lines.push("  end");
  }

  lines.push("");

  // Add edges
  for (const [name, info] of packages) {
    for (const dep of info.deps) {
      if (!packages.has(dep)) continue;
      lines.push(`  ${toMermaidId(name)} --> ${toMermaidId(dep)}`);
    }
  }

  // Add styling
  lines.push("");
  lines.push("  classDef frontend fill:#e0f2fe,stroke:#0284c7");
  lines.push("  classDef backend fill:#fef3c7,stroke:#d97706");
  lines.push("  classDef shared fill:#e0e7ff,stroke:#4f46e5");
  lines.push("  classDef tooling fill:#f0fdf4,stroke:#16a34a");

  for (const [name, info] of packages) {
    const classMap = {
      apps: "frontend",
      services: "backend",
      packages: "shared",
      tools: "tooling",
    };
    lines.push(`  class ${toMermaidId(name)} ${classMap[info.category]}`);
  }

  return lines.join("\n");
}

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
const packages = discoverPackages();
const mermaid = generateMermaid(packages);
const markdown = generateMarkdown(mermaid);
const outputPath = join(root, "docs", "architecture", "dependency-graph.md");

writeFileSync(outputPath, markdown);
console.log(
  `Generated dependency graph with ${packages.size} packages → ${outputPath}`
);
