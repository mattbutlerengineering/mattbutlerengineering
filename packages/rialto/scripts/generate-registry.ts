#!/usr/bin/env npx tsx
/**
 * Rialto Component Registry Generator
 *
 * Renders registry.json from the canonical ComponentMetadata model produced by
 * `introspectComponents()` in component-metadata.ts — the single source of truth
 * for the Rialto component graph.
 *
 * Usage: npx tsx scripts/generate-registry.ts
 *        pnpm --filter @mattbutlerengineering/rialto build:registry
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "node:url";
import { introspectComponents, type ComponentMetadata } from "./component-metadata.js";
import { projectComponents, type ProjectedComponent } from "./component-projection.js";

/* ── Types ───────────────────────────────────── */

interface Registry {
  version: string;
  components: ProjectedComponent[];
}

/* ── Conversion ──────────────────────────────── */

/**
 * Map a ComponentMetadata array to the registry JSON format.
 *
 * A thin header over the shared projection (see component-projection.ts):
 * registry components carry an `importPath`.
 */
export function buildRegistry(components: ComponentMetadata[], version: string): Registry {
  return {
    version,
    components: projectComponents(components, { includeImportPath: true }),
  };
}

/* ── Main ────────────────────────────────────── */

function main() {
  const rootDir = process.cwd();
  const outPath = path.join(rootDir, "registry.json");

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")) as {
    version: string;
  };

  const components = introspectComponents(rootDir);
  const registry = buildRegistry(components, pkg.version);

  fs.writeFileSync(outPath, JSON.stringify(registry, null, 2) + "\n");

  console.log(`Generated registry: ${components.length} components → ${outPath}`);
}

// Run as script, not when imported by another module (e.g. generate-all.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
