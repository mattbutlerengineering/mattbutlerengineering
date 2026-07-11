#!/usr/bin/env npx tsx
/**
 * Rialto Component Manifest Generator
 *
 * Renders dist/manifest.json from the canonical ComponentMetadata model
 * produced by `introspectComponents()` in component-metadata.ts — the single
 * source of truth for the Rialto component graph.
 *
 * Usage: npx tsx scripts/generate-manifest.ts
 */

import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "node:url";
import { introspectComponents, type ComponentMetadata } from "./component-metadata.js";
import { projectComponents, type ProjectedComponent } from "./component-projection.js";

/* ── Types ───────────────────────────────────── */

interface Manifest {
  version: string;
  generatedAt: string;
  components: ProjectedComponent[];
}

/* ── Conversion ──────────────────────────────── */

/**
 * Map a ComponentMetadata array to the manifest JSON format.
 *
 * A thin header over the shared projection (see component-projection.ts):
 * manifest components carry no `importPath`.
 */
export function buildManifest(
  components: ComponentMetadata[],
  version: string,
  generatedAt: string
): Manifest {
  return {
    version,
    generatedAt,
    components: projectComponents(components, { includeImportPath: false }),
  };
}

/* ── Main ────────────────────────────────────── */

function main() {
  const rootDir = process.cwd();
  const outPath = path.join(rootDir, "dist/manifest.json");

  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8")) as {
    version: string;
  };

  const components = introspectComponents(rootDir);
  const manifest = buildManifest(components, pkg.version, new Date().toISOString());

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log(`Generated manifest: ${components.length} components → ${outPath}`);
}

// Run as script, not when imported by another module (e.g. generate-all.ts).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
