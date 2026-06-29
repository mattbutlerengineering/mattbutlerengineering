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
import { introspectComponents, type ComponentMetadata } from "./component-metadata.js";

/* ── Types ───────────────────────────────────── */

interface PropInfo {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
}

interface CharacterLimitInfo {
  prop: string;
  max: number;
  reason: string;
}

interface ComponentInfo {
  name: string;
  description?: string;
  props: PropInfo[];
  slots: string[];
  characterLimits?: CharacterLimitInfo[];
}

interface Manifest {
  version: string;
  generatedAt: string;
  components: ComponentInfo[];
}

/* ── Conversion ──────────────────────────────── */

/**
 * Map a ComponentMetadata array to the manifest JSON format.
 *
 * - Projects each prop to only the fields the manifest schema defines
 *   (name, type, required; optional default and description).
 * - Omits `characterLimits` when empty so the output is byte-identical to
 *   the previous generator.
 * - Does NOT sort — introspectComponents() already returns components in
 *   byte-order (not localeCompare, which diverges macOS vs Linux CI).
 */
export function buildManifest(
  components: ComponentMetadata[],
  version: string,
  generatedAt: string
): Manifest {
  const manifestComponents: ComponentInfo[] = components.map((comp) => {
    const props: PropInfo[] = comp.props.map((p) => {
      const prop: PropInfo = { name: p.name, type: p.type, required: p.required };
      if (p.description !== undefined) prop.description = p.description;
      if (p.default !== undefined) prop.default = p.default;
      return prop;
    });

    const entry: ComponentInfo = {
      name: comp.name,
      description: comp.description,
      props,
      slots: comp.slots,
    };

    if (comp.characterLimits.length > 0) {
      entry.characterLimits = comp.characterLimits;
    }

    return entry;
  });

  return { version, generatedAt, components: manifestComponents };
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

main();
