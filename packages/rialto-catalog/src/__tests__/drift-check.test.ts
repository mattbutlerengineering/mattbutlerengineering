import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { registry } from "../registry.js";
import { catalogMeta } from "../generated-catalog.js";
import { generatedSchemas } from "../generated-schemas.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageRoot = path.resolve(__dirname, "../..");

/**
 * Components that intentionally have NO registry adapter even though they are
 * cataloged. Toast uses the useToast() provider pattern and cannot be rendered
 * as a declarative element (see registry.tsx). Keep this list tiny and
 * documented — it is the only sanctioned crack in the adapter↔meta 1:1 rule.
 */
const REGISTRY_EXCLUDED = new Set(["Toast"]);

describe("drift-check: single CatalogSource is the only source of truth", () => {
  it("generate-catalog.ts sources component data from the canonical introspectComponents module (no independent TS parse)", () => {
    const scriptPath = path.join(packageRoot, "scripts/generate-catalog.ts");
    const source = fs.readFileSync(scriptPath, "utf-8");
    // Must import the canonical model
    expect(source).toMatch(/introspectComponents/);
    expect(source).toMatch(/component-metadata/);
    // Must NOT create its own TypeScript program — that is the canonical module's job
    expect(source).not.toMatch(/ts\.createProgram/);
  });

  it("registry adapters and cataloged components are 1:1 (no drift between meta and renderers)", () => {
    const includedNames = Object.entries(catalogMeta)
      .filter(([, m]) => m.include !== false)
      .map(([name]) => name);

    const expectedAdapters = includedNames.filter((name) => !REGISTRY_EXCLUDED.has(name)).sort();
    const actualAdapters = Object.keys(registry).sort();

    expect(actualAdapters).toEqual(expectedAdapters);
  });

  it("every cataloged component has a generated Zod schema", () => {
    for (const name of Object.keys(catalogMeta)) {
      expect(generatedSchemas[name as keyof typeof generatedSchemas]).toBeDefined();
    }
  });

  it("every charLimits key resolves to a field in the generated schema (stale charLimits must fail)", () => {
    const stale: string[] = [];

    for (const [componentName, meta] of Object.entries(catalogMeta)) {
      if (!meta.charLimits) continue;

      const schema = generatedSchemas[componentName as keyof typeof generatedSchemas];
      if (!schema) continue;

      const schemaShape = (schema as { shape?: Record<string, unknown> }).shape ?? {};

      for (const key of Object.keys(meta.charLimits)) {
        if (!(key in schemaShape)) {
          stale.push(`${componentName}.charLimits.${key}`);
        }
      }
    }

    expect(stale).toEqual([]);
  });
});
