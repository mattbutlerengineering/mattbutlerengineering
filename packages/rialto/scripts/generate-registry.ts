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

interface RegistryComponent {
  name: string;
  description?: string;
  importPath: string;
  props: PropInfo[];
  slots: string[];
  characterLimits?: CharacterLimitInfo[];
}

interface Registry {
  version: string;
  components: RegistryComponent[];
}

/* ── Conversion ──────────────────────────────── */

/**
 * Map a ComponentMetadata array to the registry JSON format.
 *
 * - Projects each prop to only the fields the registry schema defines
 *   (name, type, required; optional default and description).
 * - Omits `characterLimits` when empty so the output is byte-identical to
 *   the previous generator.
 */
export function buildRegistry(components: ComponentMetadata[], version: string): Registry {
  const registryComponents: RegistryComponent[] = components.map((comp) => {
    const props: PropInfo[] = comp.props.map((p) => {
      const prop: PropInfo = { name: p.name, type: p.type, required: p.required };
      if (p.description !== undefined) prop.description = p.description;
      if (p.default !== undefined) prop.default = p.default;
      return prop;
    });

    const entry: RegistryComponent = {
      name: comp.name,
      description: comp.description,
      importPath: comp.importPath,
      props,
      slots: comp.slots,
    };

    if (comp.characterLimits.length > 0) {
      entry.characterLimits = comp.characterLimits;
    }

    return entry;
  });

  return { version, components: registryComponents };
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

main();
